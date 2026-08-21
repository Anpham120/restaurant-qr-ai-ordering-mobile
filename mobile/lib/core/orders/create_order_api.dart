import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import '../cart/cart.dart';
import '../tables/table_session.dart';

/// Đơn vừa tạo, kèm chìa khoá để xem lại nó về sau.
class CreatedOrder {
  const CreatedOrder({
    required this.orderId,
    required this.orderCode,
    required this.status,
    required this.totalAmount,
    required this.customerAccessToken,
  });

  final String orderId;
  final String orderCode;
  final String status;
  final num totalAmount;

  /// `X-Order-Token` — chìa khoá năng lực để xem lại đơn này qua `GET /api/orders/{code}`.
  ///
  /// Backend chỉ trả nó ĐÚNG MỘT LẦN, lúc tạo. Mất là mất luôn đường xem đơn theo mã, nên phải
  /// cất chứ không chỉ hiện lên màn hình.
  final String customerAccessToken;

  factory CreatedOrder.fromJson(Map<String, dynamic> json) => CreatedOrder(
        orderId: json['orderId'] as String,
        orderCode: (json['orderCode'] as String?) ?? '',
        status: (json['status'] as String?) ?? 'Placed',
        totalAmount: (json['totalAmount'] as num?) ?? 0,
        customerAccessToken: (json['customerAccessToken'] as String?) ?? '',
      );
}

abstract class CreateOrderApi {
  Future<CreatedOrder> taoDon({
    required TableSession phienBan,
    required Cart gio,
    required String khoaIdempotency,
    String? soDienThoai,
    String? maKhuyenMai,
  });
}

class HttpCreateOrderApi implements CreateOrderApi {
  HttpCreateOrderApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<CreatedOrder> taoDon({
    required TableSession phienBan,
    required Cart gio,
    required String khoaIdempotency,
    String? soDienThoai,
    String? maKhuyenMai,
  }) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/orders'),
        headers: {
          'Content-Type': 'application/json',
          'X-Table-Session-Token': phienBan.tableSessionToken,
          // BẮT BUỘC. Backend trả 400 IDEMPOTENCY_KEY_REQUIRED nếu thiếu.
          'Idempotency-Key': khoaIdempotency,
        },
        body: jsonEncode({
          'orderType': 'DineIn',
          'tableSessionId': phienBan.sessionId,
          // Đơn tại bàn đòi CẢ HAI, đo trên backend đang chạy: thiếu tableCode →
          // 400 DINE_IN_TABLE_REQUIRED, thiếu qrToken → 400 QR_TOKEN_INVALID. Chỉ gửi
          // tableSessionId là không đủ, dù nó đã xác định đúng một cái bàn.
          'tableCode': phienBan.tableCode,
          'qrToken': phienBan.qrToken,
          'items': gio.items
              .map((i) => {'menuItemId': i.menuItemId, 'quantity': i.quantity})
              .toList(growable: false),
          // TỰ ĐIỀN SỐ ĐIỆN THOẠI — §9.7 gọi đây là tính năng lõi của app, không phải điểm thưởng.
          // Khách gõ tay dễ sai, không kiểm định dạng, không tra trùng; app đã có số đã liên kết
          // nên bỏ hẳn bước gõ. Chỉ gửi khi thật sự có, không gửi chuỗi rỗng.
          if (soDienThoai != null && soDienThoai.isNotEmpty)
            'customerPhoneNumber': soDienThoai,
          if (maKhuyenMai != null && maKhuyenMai.isNotEmpty)
            'promotionCode': maKhuyenMai,
        }),
      );
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    // Đo trên backend đang chạy: lần gửi lại với CÙNG khoá và CÙNG nội dung cũng trả 201 kèm
    // đúng mã đơn cũ (ORD-1016 cả hai lần, và bảng orders chỉ có 1 dòng). Vẫn nhận cả 200 vì
    // "trả lại thứ đã có" là 200 theo lẽ thường và không có gì bảo đảm điều này không đổi.
    if (response.statusCode == 201 || response.statusCode == 200) {
      return CreatedOrder.fromJson(
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
        return const AuthException('MENU_ITEM_UNAVAILABLE',
            'Có món trong giỏ vừa hết. Xem lại giỏ rồi đặt lại.');
      case 'ORDER_ITEMS_REQUIRED':
        return const AuthException('ORDER_ITEMS_REQUIRED', 'Giỏ đang trống.');
      case 'ORDER_ITEMS_TOO_MANY':
        return const AuthException('ORDER_ITEMS_TOO_MANY',
            'Đơn có quá nhiều món. Tách thành hai đơn nhé.');
      case 'IDEMPOTENCY_KEY_REUSED':
        // Xảy ra khi giỏ đổi mà khoá không đổi. Đó là lỗi của app chứ không phải của khách, nên
        // câu thông báo phải bảo họ làm lại chứ không đổ tại họ.
        return const AuthException('IDEMPOTENCY_KEY_REUSED',
            'Giỏ vừa thay đổi. Mở lại giỏ và đặt lại giúp nhé.');
      case 'TABLE_SESSION_EXPIRED':
        return const AuthException('TABLE_SESSION_EXPIRED',
            'Phiên bàn đã kết thúc. Quét lại mã QR để vào bàn mới.');
      case 'TABLE_SESSION_TOKEN_INVALID':
        return const AuthException('TABLE_SESSION_TOKEN_INVALID',
            'Phiên bàn không còn hợp lệ. Quét lại mã QR của bàn.');
      case 'TABLE_SESSION_CONFLICT':
        return const AuthException('TABLE_SESSION_CONFLICT',
            'Bàn vừa có thay đổi. Mở lại giỏ rồi đặt lại.');
    }

    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Không đặt được đơn (mã ${response.statusCode}).');
  }
}
