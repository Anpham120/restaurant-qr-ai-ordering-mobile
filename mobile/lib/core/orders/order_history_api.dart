import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'order.dart';

abstract class OrderHistoryApi {
  Future<List<CustomerOrder>> lichSuCuaToi(String accessToken);
}

/// Gọi `GET /api/orders/mine` — lịch sử đơn qua nhiều lần ghé (#33).
///
/// Uỷ quyền bằng **JWT của khách**, không phải token bàn: đây là dữ liệu của TÀI KHOẢN, không
/// phải của một cái bàn. Ngược hẳn với `GET /api/table-sessions/{id}/orders`.
///
/// **Không có tham số định danh nào.** `memberId` do backend lấy từ JWT — cùng luật với
/// `/api/loyalty/me`. Đo thật: thêm `?memberId=` của người khác vẫn trả 0 đơn.
class HttpOrderHistoryApi implements OrderHistoryApi {
  HttpOrderHistoryApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<List<CustomerOrder>> lichSuCuaToi(String accessToken) async {
    final http.Response response;
    try {
      response = await _client.get(
        Uri.parse('$baseUrl/api/orders/mine'),
        headers: {'Authorization': 'Bearer $accessToken'},
      );
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      final body =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return ((body['orders'] as List<dynamic>?) ?? const [])
          .map((e) => CustomerOrder.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
    }

    if (response.statusCode == 401 || response.statusCode == 403) {
      return throw const AuthException('UNAUTHORIZED',
          'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem lịch sử.');
    }
    if (response.statusCode >= 500) {
      throw const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    throw AuthException(
        'UNKNOWN', 'Không tải được lịch sử (mã ${response.statusCode}).');
  }
}

/// Kết quả một lần "đặt lại món cũ".
class KetQuaDatLai {
  const KetQuaDatLai({required this.daThem, required this.khongThem});

  final List<String> daThem;

  /// Món không thêm được, kèm lý do — thường là món đã ngừng bán.
  final Map<String, String> khongThem;

  bool get tronVen => khongThem.isEmpty;
  bool get thatBaiHoanToan => daThem.isEmpty && khongThem.isNotEmpty;
}

/// Thêm lại toàn bộ món của một đơn cũ vào giỏ hiện tại (#33).
///
/// **Từng món một, và không dừng lại khi một món hỏng.** Thực đơn đổi giữa hai lần ghé là chuyện
/// bình thường: món cũ có thể đã ngừng bán, hoặc hôm nay hết. Dừng ở món đầu tiên hỏng nghĩa là
/// khách mất luôn những món vẫn còn — trong khi họ chỉ muốn gọi lại bữa cũ.
///
/// Trả về CẢ HAI danh sách. Báo "đã thêm vào giỏ" rồi im lặng bỏ ba món là nói dối với khách; họ
/// sẽ chỉ phát hiện lúc nhìn hoá đơn.
///
/// Không dùng `Future.wait`: các lời gọi giỏ hàng dùng DELTA và cùng sửa một giỏ, nên gửi song
/// song là tự tạo tranh chấp trên đúng thứ không idempotent.
Future<KetQuaDatLai> datLaiDon({
  required List<OrderItem> mon,
  required Future<void> Function(String menuItemId, int quantity) themVaoGio,
  required String Function(Object loi) moTaLoi,
}) async {
  final daThem = <String>[];
  final khongThem = <String, String>{};

  for (final m in mon) {
    // Món đã huỷ ở đơn cũ thì không đặt lại: khách đã chủ động bỏ nó.
    if (m.status == 'Cancelled') continue;
    try {
      await themVaoGio(m.menuItemId, m.quantity);
      daThem.add(m.name);
    } catch (loi) {
      khongThem[m.name] = moTaLoi(loi);
    }
  }
  return KetQuaDatLai(daThem: daThem, khongThem: khongThem);
}
