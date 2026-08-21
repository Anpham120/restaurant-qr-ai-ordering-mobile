import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'chat.dart';

abstract class ChatApi {
  Future<ChatSession> moPhien(String tableSessionId, String tableCode);
  Future<LuotChat> gui(String chatSessionId, String chatToken, String noiDung);
}

/// Gọi `/api/chat/sessions`.
///
/// **Dùng đường KHÔNG streaming.** Web dùng SSE làm đường chính (#95) để chữ hiện dần; app dùng
/// đường thường vì nó là API hạng nhất, dễ kiểm bằng `MockClient`, và không phải phân tích khung
/// SSE trong Dart. Đánh đổi thật: khách nhìn vòng quay thay vì thấy chữ chạy — xem [_thoiGianCho].
class HttpChatApi implements ChatApi {
  HttpChatApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  /// Thời gian chờ tối đa cho một lượt hỏi đáp.
  ///
  /// Đo trên hệ thống đang chạy: một câu trả lời mất **9,8 giây**. Nên đặt ngắn (5–10s) sẽ giết
  /// đúng những câu trả lời hợp lệ, còn không đặt gì thì `package:http` treo vô hạn khi dịch vụ
  /// AI chết và khách ngồi nhìn vòng quay mãi. 60 giây là chỗ ở giữa: rộng gấp sáu lần lần đo
  /// được, nhưng vẫn kết thúc.
  static const Duration _thoiGianCho = Duration(seconds: 60);

  @override
  Future<ChatSession> moPhien(String tableSessionId, String tableCode) async {
    final body = await _goi(() => _client.post(
          Uri.parse('$baseUrl/api/chat/sessions'),
          headers: {'Content-Type': 'application/json; charset=utf-8'},
          body: jsonEncode(
              {'tableSessionId': tableSessionId, 'tableCode': tableCode}),
        ));
    return ChatSession.fromJson(body);
  }

  @override
  Future<LuotChat> gui(
      String chatSessionId, String chatToken, String noiDung) async {
    final body = await _goi(
      () => _client.post(
        Uri.parse('$baseUrl/api/chat/sessions/$chatSessionId/messages'),
        headers: {
          // `charset=utf-8` là bắt buộc chứ không phải cho đẹp: thiếu nó, một câu hỏi tiếng Việt
          // có dấu bị đọc sai byte và backend trả 400 "Invalid UTF-8 middle byte" — đã gặp thật
          // khi đo bằng curl.
          'Content-Type': 'application/json; charset=utf-8',
          'X-Chat-Session-Token': chatToken,
        },
        body: utf8.encode(jsonEncode({'content': noiDung.trim()})),
      ),
      thoiGianCho: _thoiGianCho,
    );
    return LuotChat.fromJson(body);
  }

  Future<Map<String, dynamic>> _goi(
    Future<http.Response> Function() goi, {
    Duration thoiGianCho = const Duration(seconds: 15),
  }) async {
    final http.Response response;
    try {
      response = await goi().timeout(thoiGianCho);
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được trợ lý. Kiểm tra mạng rồi thử lại.');
    }
    if (response.statusCode == 200) {
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
      case 'CHAT_RATE_LIMITED':
        // 10 tin/phút, 100 tin/phiên. Nói rõ là "chờ một chút" chứ không phải "lỗi" — khách
        // không làm gì sai, chỉ hỏi nhanh quá.
        return const AuthException('CHAT_RATE_LIMITED',
            'Bạn hỏi hơi nhanh. Chờ một chút rồi hỏi tiếp nhé.');
      case 'CHAT_MESSAGE_TOO_LONG':
        return const AuthException(
            'CHAT_MESSAGE_TOO_LONG', 'Câu hỏi dài quá. Rút ngắn lại giúp nhé.');
      case 'CHAT_MESSAGE_EMPTY':
      case 'CHAT_MESSAGE_REQUIRED':
        return const AuthException('CHAT_MESSAGE_EMPTY', 'Chưa nhập câu hỏi.');
      case 'AI_PROVIDER_UNAVAILABLE':
        // Trợ lý chết KHÔNG phải app chết. Chỉ ra lối đi tiếp có thật: xem thực đơn, gọi nhân viên.
        return const AuthException('AI_PROVIDER_UNAVAILABLE',
            'Trợ lý đang bận. Bạn xem thực đơn hoặc gọi nhân viên giúp nhé.');
      case 'CHAT_SESSION_CLOSED':
        return const AuthException('CHAT_SESSION_CLOSED',
            'Cuộc trò chuyện đã đóng. Mở lại từ tab Trợ lý nhé.');
      case 'CHAT_SESSION_TOKEN_INVALID':
      case 'CHAT_SESSION_NOT_FOUND':
        return const AuthException('CHAT_SESSION_NOT_FOUND',
            'Không mở được cuộc trò chuyện này. Quay lại rồi thử lại nhé.');
      case 'CHAT_TABLE_MISMATCH':
        return const AuthException(
            'CHAT_TABLE_MISMATCH', 'Cuộc trò chuyện thuộc bàn khác.');
    }

    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Không gửi được câu hỏi (mã ${response.statusCode}).');
  }
}
