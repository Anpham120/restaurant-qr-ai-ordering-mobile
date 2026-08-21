import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';
import 'menu.dart';

class MenuData {
  const MenuData({required this.categories, required this.items});

  final List<MenuCategory> categories;
  final List<MenuItem> items;
}

abstract class MenuApi {
  Future<MenuData> thucDon();
}

/// Gọi `GET /api/menu` — công khai, KHÔNG cần đang ở bàn (§9.10 M1 mục 4).
///
/// Đây là điểm khác biệt thật giữa app và web QR: web chỉ mở được thực đơn sau khi quét mã bàn,
/// còn app cho xem trước ở nhà. Không gửi cả `Authorization` lẫn `X-Table-Session-Token` — thêm
/// vào sẽ tạo ấn tượng sai rằng thực đơn phụ thuộc phiên.
class HttpMenuApi implements MenuApi {
  HttpMenuApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<MenuData> thucDon() async {
    final http.Response response;
    try {
      response = await _client.get(Uri.parse('$baseUrl/api/menu'));
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      final body =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return MenuData(
        categories: ((body['categories'] as List<dynamic>?) ?? const [])
            .map((e) => MenuCategory.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        items: ((body['items'] as List<dynamic>?) ?? const [])
            .map((e) => MenuItem.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
    }

    if (response.statusCode >= 500) {
      throw const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    throw AuthException(
        'UNKNOWN', 'Không tải được thực đơn (mã ${response.statusCode}).');
  }
}
