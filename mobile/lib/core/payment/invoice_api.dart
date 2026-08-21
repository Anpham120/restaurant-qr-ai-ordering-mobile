import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'invoice.dart';

abstract class InvoiceApi {
  Future<Invoice> hoaDon(String sessionId, String tableSessionToken);

  /// Yêu cầu thanh toán. [method] là `COD` hoặc `VietQR`.
  ///
  /// KHÔNG phải xác nhận đã trả tiền — khách không có quyền đó.
  Future<Invoice> yeuCauThanhToan(
    String sessionId,
    String tableSessionToken,
    String method,
    String khoaIdempotency, {
    String? soDienThoai,
  });
}

class HttpInvoiceApi implements InvoiceApi {
  HttpInvoiceApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<Invoice> hoaDon(String sessionId, String tableSessionToken) async {
    final res = await _gui(() => _client.get(
          Uri.parse('$baseUrl/api/table-sessions/$sessionId/invoice'),
          headers: {'X-Table-Session-Token': tableSessionToken},
        ));
    return Invoice.fromJson(res);
  }

  @override
  Future<Invoice> yeuCauThanhToan(
    String sessionId,
    String tableSessionToken,
    String method,
    String khoaIdempotency, {
    String? soDienThoai,
  }) async {
    final res = await _gui(() => _client.post(
          Uri.parse(
              '$baseUrl/api/table-sessions/$sessionId/invoice/payment-request'),
          headers: {
            'Content-Type': 'application/json',
            'X-Table-Session-Token': tableSessionToken,
            // Bắt buộc, giống POST /api/orders. Thiếu là 400 IDEMPOTENCY_KEY_REQUIRED.
            'Idempotency-Key': khoaIdempotency,
          },
          body: jsonEncode({
            'method': method,
            // Số điện thoại đi kèm hoá đơn là thứ quyết định đơn này có được tích điểm hay không
            // (§9.7). Chỉ gửi khi thật sự có.
            if (soDienThoai != null && soDienThoai.isNotEmpty)
              'customerPhoneNumber': soDienThoai,
          }),
        ));
    // Phản hồi bọc hoá đơn trong khoá `invoice`, khác với GET trả thẳng hoá đơn.
    final invoice = res['invoice'];
    return Invoice.fromJson(invoice is Map<String, dynamic> ? invoice : res);
  }

  Future<Map<String, dynamic>> _gui(
      Future<http.Response> Function() goi) async {
    final http.Response response;
    try {
      response = await goi();
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }
    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(utf8.decode(response.bodyBytes))
          as Map<String, dynamic>;
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
      case 'VIETQR_CONFIG_MISSING':
        // Quán chưa cấu hình ngân hàng. Đây KHÔNG phải lỗi của khách, và câu thông báo phải chỉ
        // ra lối thoát có thật thay vì bảo họ thử lại — thử lại sẽ hỏng y hệt.
        return const AuthException('VIETQR_CONFIG_MISSING',
            'Chuyển khoản đang tạm ngưng. Chọn trả tiền mặt tại quầy giúp nhé.');
      case 'TABLE_INVOICE_PAYMENT_PENDING':
        return const AuthException('TABLE_INVOICE_PAYMENT_PENDING',
            'Bàn đã yêu cầu thanh toán rồi. Chờ nhân viên xác nhận nhé.');
      case 'TABLE_INVOICE_EMPTY':
        return const AuthException(
            'TABLE_INVOICE_EMPTY', 'Bàn chưa có món nào để thanh toán.');
      case 'PAYMENT_METHOD_INVALID':
        return const AuthException(
            'PAYMENT_METHOD_INVALID', 'Cách thanh toán không hợp lệ.');
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
        code, 'Không gửi được yêu cầu thanh toán (mã ${response.statusCode}).');
  }
}
