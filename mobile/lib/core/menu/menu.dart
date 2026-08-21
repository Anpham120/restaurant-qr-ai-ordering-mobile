class MenuCategory {
  const MenuCategory({required this.categoryId, required this.name});

  final String categoryId;
  final String name;

  factory MenuCategory.fromJson(Map<String, dynamic> json) => MenuCategory(
        categoryId: json['categoryId'] as String,
        name: json['name'] as String,
      );
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    this.description,
    required this.price,
    required this.categoryId,
    required this.categoryName,
    this.imageUrl,
    required this.isAvailable,
    required this.tags,
  });

  final String id;
  final String name;
  final String? description;
  final num price;
  final String categoryId;
  final String categoryName;

  /// Đường dẫn TƯƠNG ĐỐI như `/menu-images/04-banh-cuon-thanh-tri.webp` — xem [urlAnh].
  final String? imageUrl;

  final bool isAvailable;
  final List<String> tags;

  factory MenuItem.fromJson(Map<String, dynamic> json) => MenuItem(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        price: json['price'] as num,
        categoryId: (json['categoryId'] as String?) ?? '',
        categoryName: (json['categoryName'] as String?) ?? '',
        imageUrl: json['imageUrl'] as String?,
        isAvailable: (json['isAvailable'] as bool?) ?? true,
        tags: ((json['tags'] as List<dynamic>?) ?? const [])
            .map((e) => e.toString())
            .toList(growable: false),
      );
}

/// Một danh mục kèm các món thuộc nó.
class NhomMon {
  const NhomMon({required this.tenDanhMuc, required this.mon});

  final String tenDanhMuc;
  final List<MenuItem> mon;
}

/// Nhóm món theo danh mục để hiện thành từng khối.
///
/// `GET /api/menu` trả hai danh sách PHẲNG và tách rời (`categories`, `items`), không lồng nhau —
/// nên việc nhóm là của client.
///
/// Ba luật, mỗi luật đều có phép kiểm:
///
/// - **Giữ nguyên thứ tự danh mục do máy chủ trả về.** Đó là thứ tự quán muốn thực đơn hiện ra
///   (khai vị trước, tráng miệng sau), không phải thứ tự bảng chữ cái.
/// - **Bỏ danh mục rỗng.** Một tiêu đề không có món nào bên dưới trông như lỗi tải.
/// - **KHÔNG đánh rơi món mồ côi.** Món có `categoryId` không khớp danh mục nào vẫn phải hiện ra,
///   gom vào một khối cuối. Lặng lẽ bỏ đi nghĩa là một món có thật biến mất khỏi thực đơn vì một
///   lỗi dữ liệu ở chỗ khác — và không ai thấy gì để mà sửa.
List<NhomMon> nhomTheoDanhMuc(List<MenuCategory> danhMuc, List<MenuItem> mon) {
  final theoId = <String, List<MenuItem>>{};
  for (final m in mon) {
    theoId.putIfAbsent(m.categoryId, () => <MenuItem>[]).add(m);
  }

  final ketQua = <NhomMon>[];
  final daDung = <String>{};
  for (final c in danhMuc) {
    final ds = theoId[c.categoryId];
    if (ds == null || ds.isEmpty) continue;
    daDung.add(c.categoryId);
    ketQua.add(NhomMon(tenDanhMuc: c.name, mon: ds));
  }

  final moCoi = <MenuItem>[];
  for (final entry in theoId.entries) {
    if (!daDung.contains(entry.key)) moCoi.addAll(entry.value);
  }
  if (moCoi.isNotEmpty) {
    ketQua.add(NhomMon(tenDanhMuc: 'Món khác', mon: moCoi));
  }
  return ketQua;
}

/// Địa chỉ đầy đủ của ảnh món.
///
/// Ảnh KHÔNG do API phục vụ. Đo trên hệ thống đang chạy:
///
///     GET :8081/menu-images/04-banh-cuon-thanh-tri.webp  → 401   (API)
///     GET :8080/menu-images/04-banh-cuon-thanh-tri.webp  → 200   (web)
///
/// Nên app cần một base URL RIÊNG cho ảnh. Ghép nhầm vào base của API thì mọi ảnh im lặng hỏng và
/// thực đơn hiện ra trống trơn mà không có lỗi nào để lần theo.
///
/// Đường dẫn tuyệt đối được giữ nguyên: nếu một ngày ảnh chuyển sang CDN, `imageUrl` sẽ là URL đầy
/// đủ và hàm này không được phép ghép thêm gì vào trước.
String? urlAnh(String? imageUrl, String imageBaseUrl) {
  final duongDan = imageUrl?.trim();
  if (duongDan == null || duongDan.isEmpty) return null;
  if (duongDan.startsWith('http://') || duongDan.startsWith('https://')) {
    return duongDan;
  }
  final base = imageBaseUrl.endsWith('/')
      ? imageBaseUrl.substring(0, imageBaseUrl.length - 1)
      : imageBaseUrl;
  return duongDan.startsWith('/') ? '$base$duongDan' : '$base/$duongDan';
}

/// Bỏ dấu tiếng Việt để so khớp khi tìm món.
///
/// Bàn phím điện thoại thường không bật bộ gõ tiếng Việt, và khách gõ một tay khi đang ngồi ăn.
/// Bắt gõ đúng dấu làm ô tìm kiếm vô dụng đúng lúc nó cần chạy: gõ "pho" phải ra "Phở bò".
///
/// `đ` phải xử lý riêng vì NFD KHÔNG tách nó — `đ` là ký tự Latin độc lập (U+0111), không phải
/// `d` cộng dấu. Thiếu dòng đó thì gõ "dau hu" không tìm ra "Đậu hũ".
String _boDau(String text) => text
    .toLowerCase()
    .replaceAll('đ', 'd')
    .replaceAll(RegExp('[àáạảãâầấậẩẫăằắặẳẵ]'), 'a')
    .replaceAll(RegExp('[èéẹẻẽêềếệểễ]'), 'e')
    .replaceAll(RegExp('[ìíịỉĩ]'), 'i')
    .replaceAll(RegExp('[òóọỏõôồốộổỗơờớợởỡ]'), 'o')
    .replaceAll(RegExp('[ùúụủũưừứựửữ]'), 'u')
    .replaceAll(RegExp('[ỳýỵỷỹ]'), 'y')
    .trim();

/// Lọc món theo từ khoá. Từ khoá rỗng trả nguyên danh sách.
///
/// GIỮ NGUYÊN thứ tự đầu vào — thứ tự đó là thứ tự quán muốn thực đơn hiện ra.
List<MenuItem> locMonTheoTen(List<MenuItem> mon, String tuKhoa) {
  final khoa = _boDau(tuKhoa);
  if (khoa.isEmpty) return mon;
  return mon
      .where((m) => _boDau(m.name).contains(khoa))
      .toList(growable: false);
}
