import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'table_session.dart';

/// Mở hoặc tiếp tục phiên bàn.
abstract class TableSessionApi {
  /// [accessToken] là JWT của khách nếu đã đăng nhập, `null` nếu là khách vãng lai.
  Future<TableSession> moPhien(String qrToken,
      {String? tableCode, String? accessToken});
}

class HttpTableSessionApi implements TableSessionApi {
  HttpTableSessionApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<TableSession> moPhien(String qrToken,
      {String? tableCode, String? accessToken}) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/table-sessions'),
        headers: {
          'Content-Type': 'application/json',
          // GỬI TOKEN KHI CÓ. Đây là toàn bộ cơ chế gắn phiên vào tài khoản (§9.4): endpoint này
          // ẩn danh, backend chỉ đọc `Authorization` NẾU có và gắn `MemberId` khi vai là Customer.
          // Không gửi thì app chạy đúng như web — và mất sạch lớp tính năng độc quyền của app.
          if (accessToken != null) 'Authorization': 'Bearer $accessToken',
        },
        body: jsonEncode({
          'qrToken': qrToken,
          if (tableCode != null && tableCode.isNotEmpty) 'tableCode': tableCode,
        }),
      );
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      final body =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      // Backend KHÔNG trả lại qrToken. Nhét chính cái vừa gửi vào đây để phiên cất xuống máy có
      // đủ thứ cần cho việc đặt món sau này — xem ghi chú ở TableSession.qrToken.
      return TableSession.fromJson({...body, 'qrToken': qrToken});
    }
    throw _dichLoi(response);
  }

  /// Dịch theo MÃ, không hiển thị câu tiếng Anh của máy chủ — cùng lý do đã ghi ở `AuthApi`.
  AuthException _dichLoi(http.Response response) {
    String code = 'UNKNOWN';
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (body is Map && body['error'] is Map) {
        code = (body['error'] as Map)['code']?.toString() ?? 'UNKNOWN';
      }
    } catch (_) {
      // Thân không phải JSON (nginx trả HTML 502) — rơi xuống nhánh theo mã HTTP.
    }

    switch (code) {
      case 'QR_NOT_FOUND':
        return const AuthException(
            'QR_NOT_FOUND', 'Mã QR không đúng hoặc bàn đã ngừng phục vụ.');
      case 'QR_TOKEN_INVALID':
        return const AuthException(
            'QR_TOKEN_INVALID', 'Chưa có mã QR của bàn.');
      case 'QR_TABLE_MISMATCH':
        return const AuthException('QR_TABLE_MISMATCH',
            'Mã QR này không thuộc bàn vừa chọn. Quét lại đúng bàn.');
      case 'TABLE_CODE_INVALID':
        return const AuthException(
            'TABLE_CODE_INVALID', 'Mã bàn phải có dạng T01.');
    }

    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Không mở được phiên bàn (mã ${response.statusCode}).');
  }
}
