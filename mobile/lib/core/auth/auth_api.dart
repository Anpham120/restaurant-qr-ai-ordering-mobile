import 'dart:convert';

import 'package:http/http.dart' as http;

import 'auth_session.dart';

/// Lỗi đăng nhập đã dịch sang câu người dùng đọc được, kèm mã ổn định để mã nguồn phân nhánh.
class AuthException implements Exception {
  const AuthException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => 'AuthException($code): $message';
}

/// Cổng đăng nhập.
///
/// Là interface chứ không phải lớp cụ thể vì `AuthRepository` cần thay được nó trong `flutter
/// test`, và Dart KHÔNG cho `implements` một lớp có thành viên riêng tư từ thư viện khác — bản
/// HTTP giữ một `http.Client` riêng tư, nên nếu để nguyên thì bản giả lập không biên dịch nổi.
abstract class AuthApi {
  Future<AuthSession> dangNhap(String email, String password);
}

/// Gọi `/api/auth` của backend Java.
///
/// Ghi chú lịch sử: đề bài #25 viết "gọi bản .NET hiện có". Câu đó đã lỗi thời — `backend/` bị
/// xoá ở #59 và §9.9 của kế hoạch đã sửa thành "Flutter gọi backend Java, tất cả các module".
class HttpAuthApi implements AuthApi {
  HttpAuthApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<AuthSession> dangNhap(String email, String password) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/auth/login'),
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode({'email': email, 'password': password}),
      );
    } catch (error) {
      // Mất mạng trong quán là chuyện thường. Phân biệt rõ với sai mật khẩu: bảo khách kiểm tra
      // lại mật khẩu trong khi thực ra rớt wifi là cách nhanh nhất khiến họ đổi mật khẩu vô ích.
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      return AuthSession.fromJson(
        jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>,
      );
    }

    throw _dichLoi(response);
  }

  /// Dịch thân lỗi `{"error":{"code":..,"message":..,"details":{}}}` của backend.
  ///
  /// Hiển thị thẳng `message` từ máy chủ là sai: chuỗi đó bằng tiếng Anh và viết cho lập trình
  /// viên ("Email or password is incorrect."). Dịch theo **mã**, vì mã là phần backend cam kết
  /// giữ ổn định, còn câu chữ thì không.
  AuthException _dichLoi(http.Response response) {
    String code = 'UNKNOWN';
    try {
      final body = jsonDecode(utf8.decode(response.bodyBytes));
      if (body is Map && body['error'] is Map) {
        code = (body['error'] as Map)['code']?.toString() ?? 'UNKNOWN';
      }
    } catch (_) {
      // Thân không phải JSON (nginx trả HTML 502 chẳng hạn) — rơi xuống nhánh theo mã HTTP.
    }

    switch (code) {
      case 'INVALID_CREDENTIALS':
        return const AuthException(
            'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
      case 'EMAIL_INVALID':
        return const AuthException('EMAIL_INVALID', 'Email không hợp lệ.');
      case 'PASSWORD_REQUIRED':
        return const AuthException('PASSWORD_REQUIRED', 'Chưa nhập mật khẩu.');
    }

    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Đăng nhập không thành công (mã ${response.statusCode}).');
  }
}
