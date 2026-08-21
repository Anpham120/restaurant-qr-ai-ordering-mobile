/// Địa chỉ máy chủ mà app đang trỏ tới.
///
/// Vì sao phải sửa được LÚC CHẠY thay vì chỉ `--dart-define`:
///
/// `--dart-define` là **compile-time**. Một APK dựng ở CI mang sẵn `10.0.2.2:8081`, và địa chỉ đó
/// chỉ tồn tại **bên trong máy ảo Android** — cắm APK ấy vào điện thoại thật thì nó gọi vào hư
/// không. Muốn mỗi lần đổi mạng lại dựng một APK riêng thì phải có máy dựng được APK, thứ mà máy
/// phát triển của dự án này không có (Docker 3,6 GB, Gradle mặc định xin 8 GB).
///
/// Nên một APK duy nhất + màn hình nhập địa chỉ là cách duy nhất để §9.10 ("kiểm thử trên thiết bị
/// thật, chụp bằng chứng ở mỗi pha") thực hiện được.
class CauHinhMayChu {
  const CauHinhMayChu({required this.apiBaseUrl, required this.imageBaseUrl});

  final String apiBaseUrl;
  final String imageBaseUrl;

  Map<String, dynamic> toJson() =>
      {'apiBaseUrl': apiBaseUrl, 'imageBaseUrl': imageBaseUrl};

  factory CauHinhMayChu.fromJson(Map<String, dynamic> json) => CauHinhMayChu(
        apiBaseUrl: (json['apiBaseUrl'] as String?) ?? '',
        imageBaseUrl: (json['imageBaseUrl'] as String?) ?? '',
      );
}

/// Chuẩn hoá thứ người dùng gõ thành một URL dùng được, hoặc `null` nếu không hiểu được.
///
/// Người gõ trên bàn phím điện thoại sẽ gõ `192.168.1.5`, không gõ `http://192.168.1.5:8081/`.
/// Bắt họ gõ đủ là bắt họ gõ đúng ba thứ dễ sai trên một bàn phím nhỏ.
///
/// Luật:
/// - thiếu scheme → thêm `http://` (mạng LAN trong quán không có TLS);
/// - thiếu cổng → thêm [congMacDinh];
/// - cắt dấu `/` thừa ở cuối để việc ghép đường dẫn về sau không sinh ra `//`.
String? chuanHoaDiaChi(String nhapVao, {required int congMacDinh}) {
  var s = nhapVao.trim();
  if (s.isEmpty) return null;

  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'http://$s';
  }

  final uri = Uri.tryParse(s);
  if (uri == null || uri.host.isEmpty) return null;
  // Chặn thứ người dùng dễ dán nhầm: một đường dẫn đầy đủ tới endpoint chứ không phải địa chỉ gốc.
  if (uri.pathSegments.isNotEmpty) return null;

  final cong = uri.hasPort ? uri.port : congMacDinh;
  return '${uri.scheme}://${uri.host}:$cong';
}

/// Đoán địa chỉ ẢNH từ địa chỉ API.
///
/// Ảnh do container web phục vụ ở cổng 8080, API ở 8081 — cùng máy. Đoán giúp để người dùng chỉ
/// phải gõ MỘT địa chỉ; vẫn sửa được nếu triển khai khác.
String suyRaDiaChiAnh(String apiBaseUrl, {int congAnh = 8080}) {
  final uri = Uri.tryParse(apiBaseUrl);
  if (uri == null || uri.host.isEmpty) return apiBaseUrl;
  return '${uri.scheme}://${uri.host}:$congAnh';
}
