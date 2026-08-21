import 'dart:convert';

import 'package:http/http.dart' as http;

import '../auth/auth_api.dart';

/// Một món khách hay gọi (#35, §9.8).
class MonHayGoi {
  const MonHayGoi({
    required this.menuItemId,
    required this.name,
    required this.timesOrdered,
    required this.totalQuantity,
  });

  final String menuItemId;
  final String name;

  /// Số LẦN gọi — con số quyết định thứ tự.
  final int timesOrdered;

  /// Tổng số phần. Có ích để giải thích, không dùng để xếp hạng: tám phần chè trong đúng một bữa
  /// liên hoan không phải là thói quen.
  final int totalQuantity;

  factory MonHayGoi.fromJson(Map<String, dynamic> json) => MonHayGoi(
        menuItemId: json['menuItemId'] as String,
        name: (json['name'] as String?) ?? '',
        timesOrdered: (json['timesOrdered'] as num?)?.toInt() ?? 0,
        totalQuantity: (json['totalQuantity'] as num?)?.toInt() ?? 0,
      );
}

abstract class FavouriteApi {
  Future<List<MonHayGoi>> monHayGoi(String accessToken);
}

/// Gọi `GET /api/orders/mine/favourites`.
///
/// §9.8 nói rõ phần này **không cần cơ chế mới**: chỉ là truy vấn lịch sử `Order` theo `MemberId`,
/// thứ đã có từ #26/#33.
///
/// Phần CÒN LẠI của §9.8 — hồ sơ AI bền vững qua bảng `CustomerProfileFact` — **chưa tồn tại**,
/// và §9.8 giao nó cho backend + AI-service chứ không cho môn Lập trình di động. Xem
/// `mobile/README.md`.
class HttpFavouriteApi implements FavouriteApi {
  HttpFavouriteApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  @override
  Future<List<MonHayGoi>> monHayGoi(String accessToken) async {
    final http.Response response;
    try {
      response = await _client.get(
        Uri.parse('$baseUrl/api/orders/mine/favourites'),
        headers: {'Authorization': 'Bearer $accessToken'},
      );
    } catch (_) {
      throw const AuthException('NETWORK_ERROR',
          'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }

    if (response.statusCode == 200) {
      final body =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      return ((body['items'] as List<dynamic>?) ?? const [])
          .map((e) => MonHayGoi.fromJson(e as Map<String, dynamic>))
          .toList(growable: false);
    }
    if (response.statusCode == 401 || response.statusCode == 403) {
      throw const AuthException(
          'UNAUTHORIZED', 'Phiên đăng nhập đã hết hạn. Đăng nhập lại nhé.');
    }
    if (response.statusCode >= 500) {
      throw const AuthException(
          'SERVER_ERROR', 'Máy chủ đang lỗi. Thử lại sau ít phút.');
    }
    throw AuthException(
        'UNKNOWN', 'Không tải được món hay gọi (mã ${response.statusCode}).');
  }
}

/// Câu mô tả thói quen, hoặc `null` nếu chưa đủ căn cứ để nói.
///
/// Gọi **một lần** thì chưa phải "hay gọi" — đó chỉ là một lần thử. Hiện "1 lần" dưới nhãn "Món
/// tôi hay gọi" vừa vô nghĩa vừa khiến danh sách đầy những món khách ăn thử rồi thôi.
String? moTaThoiQuen(MonHayGoi m) {
  if (m.timesOrdered < 2) return null;
  return 'Đã gọi ${m.timesOrdered} lần';
}

/// Lọc ra những món thật sự là thói quen.
List<MonHayGoi> locThoiQuen(List<MonHayGoi> tatCa) =>
    tatCa.where((m) => m.timesOrdered >= 2).toList(growable: false);
