import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'cart.dart';

abstract class CartApi {
  Future<Cart> gio(String sessionId, String tableSessionToken);

  /// Cộng/trừ số lượng một món.
  ///
  /// Backend nhận DELTA chứ không nhận số lượng tuyệt đối — xem ghi chú ở [HttpCartApi].
  Future<Cart> doiSoLuong(
      String sessionId, String tableSessionToken, String menuItemId, int delta);

  Future<Cart> xoaHet(String sessionId, String tableSessionToken);
}

/// Gọi `/api/table-sessions/{id}/cart`.
///
/// **Giỏ hàng nhận DELTA, không nhận số lượng tuyệt đối** (`{menuItemId, delta}`). Hệ quả phải
/// nhớ: lời gọi này KHÔNG idempotent. Gửi `+1` hai lần thì khách có hai phần, không phải một.
///
/// Nên lớp này **không tự gửi lại** khi lỗi mạng, và cũng không có chỗ nào để bật lại. Khi một
/// lời gọi hỏng mà không rõ máy chủ đã nhận hay chưa, việc đúng là ĐỌC LẠI giỏ (`GET`) và hiện
/// sự thật, chứ không đoán rồi gửi thêm một delta nữa.
///
/// Khác hẳn `POST /api/orders`: chỗ đó có `Idempotency-Key` nên gửi lại được an toàn.
class HttpCartApi implements CartApi {
  HttpCartApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<Cart> gio(String sessionId, String tableSessionToken) =>
      _goi(() => _client.get(
            Uri.parse('$baseUrl/api/table-sessions/$sessionId/cart'),
            headers: {'X-Table-Session-Token': tableSessionToken},
          ));

  @override
  Future<Cart> doiSoLuong(String sessionId, String tableSessionToken,
          String menuItemId, int delta) =>
      _goi(() => _client.post(
            Uri.parse('$baseUrl/api/table-sessions/$sessionId/cart/items'),
            headers: {
              'Content-Type': 'application/json',
              'X-Table-Session-Token': tableSessionToken,
            },
            body: jsonEncode({'menuItemId': menuItemId, 'delta': delta}),
          ));

  @override
  Future<Cart> xoaHet(String sessionId, String tableSessionToken) =>
      _goi(() => _client.delete(
            Uri.parse('$baseUrl/api/table-sessions/$sessionId/cart'),
            headers: {'X-Table-Session-Token': tableSessionToken},
          ));

  Future<Cart> _goi(Future<http.Response> Function() gui) async {
    final http.Response response;
    try {
      response = await gui();
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }
    if (response.statusCode == 200) {
      return Cart.fromJson(
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>);
    }
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
      case 'MENU_ITEM_UNAVAILABLE':
        return const AuthException(
            'MENU_ITEM_UNAVAILABLE', 'Món này vừa hết. Chọn món khác nhé.');
      case 'CART_ITEM_QUANTITY_INVALID':
        return const AuthException('CART_ITEM_QUANTITY_INVALID',
            'Số lượng vượt quá mức cho phép cho một món.');
      case 'TABLE_INVOICE_PAYMENT_PENDING':
        // Backend cố ý vẫn cho BỚT món khi đang chờ thanh toán, chỉ chặn thêm. Câu này phải nói
        // đúng điều đó, không nói chung chung là "giỏ đã khoá".
        return const AuthException('TABLE_INVOICE_PAYMENT_PENDING',
            'Bàn đang chờ thanh toán nên không thêm món được. Vẫn bớt được món đã chọn.');
      case 'TABLE_SESSION_SETTLED':
        return const AuthException('TABLE_SESSION_SETTLED',
            'Bàn đã thanh toán xong. Quét lại mã QR để mở bàn mới.');
      case 'TABLE_SESSION_EXPIRED':
        return const AuthException('TABLE_SESSION_EXPIRED',
            'Phiên bàn đã kết thúc. Quét lại mã QR để vào bàn mới.');
      case 'TABLE_SESSION_TOKEN_INVALID':
        return const AuthException('TABLE_SESSION_TOKEN_INVALID',
            'Phiên bàn không còn hợp lệ. Quét lại mã QR của bàn.');
    }

    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Không cập nhật được giỏ (mã ${response.statusCode}).');
  }
}
