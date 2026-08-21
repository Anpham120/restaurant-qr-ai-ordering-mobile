import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'order.dart';

abstract class OrderApi {
  Future<List<CustomerOrder>> donCuaPhien(
      String sessionId, String tableSessionToken);

  /// Khách tự huỷ một món của mình (hạn chế #11).
  ///
  /// Uỷ quyền bằng `X-Order-Token` của ĐÚNG đơn đó, không phải token bàn: người đặt mới là
  /// người quyết định huỷ.
  Future<void> huyMon(String orderCode, String orderItemId, String orderToken);
}

/// Gọi `GET /api/table-sessions/{id}/orders` — xem đơn CHỈ ĐỌC (§9.10 M1 mục 4).
///
/// Uỷ quyền bằng `X-Table-Session-Token`, KHÔNG bằng JWT của khách. Đó là chủ ý của backend: đơn
/// thuộc về cái BÀN, không thuộc về tài khoản. Ai đang ngồi ở bàn đều xem được, kể cả khách vãng
/// lai đi cùng — đúng như hành vi ở web.
///
/// Gửi kèm `Authorization` sẽ không làm gì cả, nhưng tạo ấn tượng sai rằng đăng nhập là điều kiện
/// để xem đơn. Việc tạo đơn nằm ở #29.
class HttpOrderApi implements OrderApi {
  HttpOrderApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<List<CustomerOrder>> donCuaPhien(
      String sessionId, String tableSessionToken) async {
    final http.Response response;
    try {
      response = await _client.get(
        Uri.parse('$baseUrl/api/table-sessions/$sessionId/orders'),
        headers: {'X-Table-Session-Token': tableSessionToken},
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
    throw _dichLoi(response);
  }

  @override
  Future<void> huyMon(
      String orderCode, String orderItemId, String orderToken) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/orders/$orderCode/items/$orderItemId/cancel'),
        headers: {'X-Order-Token': orderToken},
      );
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }
    if (response.statusCode == 200) return;
    throw _dichLoi(response);
  }

  AuthException _dichLoi(http.Response response) {
    String code = 'UNKNOWN';
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (body is Map && body['error'] is Map) {
        code = (body['error'] as Map)['code']?.toString() ?? 'UNKNOWN';
      }
    } catch (_) {
      // Thân không phải JSON — rơi xuống nhánh theo mã HTTP.
    }

    switch (code) {
      case 'TABLE_SESSION_TOKEN_INVALID':
        return const AuthException('TABLE_SESSION_TOKEN_INVALID',
            'Phiên bàn không còn hợp lệ. Quét lại mã QR của bàn.');
      case 'TABLE_SESSION_EXPIRED':
        // 410 GONE. Câu này phải khác hẳn "token sai": khách không làm gì sai, chỉ là bàn đã đóng.
        return const AuthException('TABLE_SESSION_EXPIRED',
            'Phiên bàn đã kết thúc. Quét lại mã QR để vào bàn mới.');
      case 'TABLE_SESSION_NOT_FOUND':
        return const AuthException(
            'TABLE_SESSION_NOT_FOUND', 'Không tìm thấy phiên bàn này.');
      case 'ORDER_ITEM_CANCEL_NOT_ALLOWED':
        // Bếp đã bắt đầu nấu. Nói đúng lý do thay vì "không huỷ được": khách cần biết đây là
        // giới hạn có thật chứ không phải app hỏng, và rằng nhân viên vẫn xử lý được.
        return const AuthException('ORDER_ITEM_CANCEL_NOT_ALLOWED',
            'Bếp đã bắt đầu nấu món này nên không tự huỷ được. Báo nhân viên giúp nhé.');
      case 'ORDER_NOT_FOUND':
        // Backend cố ý trả ORDER_NOT_FOUND cho cả trường hợp SAI TOKEN, để không lộ đơn nào tồn
        // tại (mã đơn tăng dần). Nên câu này phải phủ được cả hai nghĩa.
        return const AuthException('ORDER_NOT_FOUND',
            'Không tìm thấy đơn này, hoặc máy bạn không có quyền huỷ nó.');
    }

    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Không tải được đơn (mã ${response.statusCode}).');
  }
}
