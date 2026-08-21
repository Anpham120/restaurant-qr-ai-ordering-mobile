import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'promotion.dart';

abstract class PromotionApi {
  Future<List<Promotion>> dangChay();
}

/// Gọi `GET /api/promotions/active` — endpoint mới thêm cho app (§9.5, §9.10 M1 mục 3).
class HttpPromotionApi implements PromotionApi {
  HttpPromotionApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<List<Promotion>> dangChay() async {
    final http.Response response;
    try {
      // KHÔNG gửi Authorization. Endpoint công khai, và khuyến mãi phải xem được cả khi chưa đăng
      // nhập — mã khuyến mãi là thứ quán in lên tờ rơi.
      response = await _client.get(Uri.parse('$baseUrl/api/promotions/active'));
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      final body =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final items = (body['items'] as List<dynamic>? ?? const []);
      return items
          .map((e) => Promotion.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
    }

    if (response.statusCode >= 500) {
      throw const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    throw AuthException(
        'UNKNOWN', 'Không tải được khuyến mãi (mã ${response.statusCode}).');
  }
}
