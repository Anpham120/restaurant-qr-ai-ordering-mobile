import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'loyalty.dart';

abstract class LoyaltyApi {
  Future<MyLoyalty> cuaToi(String accessToken);
  Future<MyLoyalty> noiSo(String accessToken, String phone);

  /// Đổi điểm lấy ưu đãi (#34).
  ///
  /// [khoaIdempotency] BẮT BUỘC: bấm hai lần lúc mạng chập chờn ở đây tiêu điểm THẬT của khách.
  Future<KetQuaDoiDiem> doiDiem(
      String accessToken, String rewardId, String khoaIdempotency);
}

/// Gọi `/api/loyalty/me` — điểm của CHÍNH tài khoản đang đăng nhập.
///
/// KHÔNG có hàm nào nhận số điện thoại rồi trả điểm của số đó. `/api/loyalty/lookup` tồn tại
/// nhưng chỉ dành cho nhân viên có chủ ý: ai gọi được cũng đếm được số nào là khách và tiêu bao
/// nhiêu. App không có đường tới đó, và đó là chủ ý chứ không phải thiếu sót.
class HttpLoyaltyApi implements LoyaltyApi {
  HttpLoyaltyApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<MyLoyalty> cuaToi(String accessToken) async {
    return _goi(() => _client.get(
          Uri.parse('$baseUrl/api/loyalty/me'),
          headers: {'Authorization': 'Bearer $accessToken'},
        ));
  }

  @override
  Future<MyLoyalty> noiSo(String accessToken, String phone) async {
    return _goi(() => _client.post(
          Uri.parse('$baseUrl/api/loyalty/me/phone'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $accessToken',
          },
          body: jsonEncode({'phone': phone.trim()}),
        ));
  }

  @override
  Future<KetQuaDoiDiem> doiDiem(
      String accessToken, String rewardId, String khoaIdempotency) async {
    final http.Response response;
    try {
      response = await _client.post(
        Uri.parse('$baseUrl/api/loyalty/me/redeem'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $accessToken',
          'Idempotency-Key': khoaIdempotency,
        },
        body: jsonEncode({'rewardId': rewardId}),
      );
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }
    if (response.statusCode == 200) {
      return KetQuaDoiDiem.fromJson(
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>);
    }
    throw _dichLoi(response);
  }

  Future<MyLoyalty> _goi(Future<http.Response> Function() gui) async {
    final http.Response response;
    try {
      response = await gui();
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      return MyLoyalty.fromJson(
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
      case 'LOYALTY_PHONE_ALREADY_MEMBER':
        // Câu này phải nói RÕ việc cần làm tiếp. "Số đã tồn tại" khiến khách nghĩ mình gõ nhầm
        // và gõ lại mãi; sự thật là họ đã là thành viên và phải nhờ quầy nối hộ.
        return const AuthException('LOYALTY_PHONE_ALREADY_MEMBER',
            'Số này đã có tài khoản tích điểm. Nhờ nhân viên tại quầy nối vào tài khoản của bạn.');
      case 'LOYALTY_PHONE_TAKEN':
        return const AuthException(
            'LOYALTY_PHONE_TAKEN', 'Số này đang gắn với một tài khoản khác.');
      case 'LOYALTY_NOT_ENOUGH_POINTS':
        // Backend cố ý KHÔNG phân biệt "không đủ điểm" với "thua tranh chấp" — với khách hai thứ
        // nói cùng một điều. Số dư trên màn hình được đọc lại sau đó mới là con số thật.
        return const AuthException(
            'LOYALTY_NOT_ENOUGH_POINTS', 'Chưa đủ điểm cho ưu đãi này.');
      case 'LOYALTY_NOT_LINKED':
        return const AuthException('LOYALTY_NOT_LINKED',
            'Liên kết số điện thoại trước khi đổi ưu đãi nhé.');
      case 'LOYALTY_REWARD_INACTIVE':
        return const AuthException(
            'LOYALTY_REWARD_INACTIVE', 'Ưu đãi này đã ngừng áp dụng.');
      case 'LOYALTY_REWARD_NOT_FOUND':
        return const AuthException(
            'LOYALTY_REWARD_NOT_FOUND', 'Không tìm thấy ưu đãi này.');
      case 'LOYALTY_PHONE_INVALID':
      case 'LOYALTY_PHONE_REQUIRED':
        return const AuthException(
            'LOYALTY_PHONE_INVALID', 'Số điện thoại không hợp lệ.');
    }

    if (response.statusCode == 401 || response.statusCode == 403) {
      return const AuthException('UNAUTHORIZED',
          'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem điểm.');
    }
    if (response.statusCode >= 500) {
      return const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    return AuthException(
        code, 'Không tải được điểm thưởng (mã ${response.statusCode}).');
  }
}
