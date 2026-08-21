/// Một khuyến mãi đang chạy.
///
/// Ánh xạ `PromotionDtos.ActivePromotionResponse` của backend Java.
class Promotion {
  const Promotion({
    required this.code,
    required this.name,
    this.description,
    required this.type,
    required this.discountValue,
    this.minOrderAmount,
    this.maxDiscountAmount,
    required this.isFlashSale,
    this.endsAt,
  });

  final String code;
  final String name;
  final String? description;

  /// `Percentage` hoặc `FixedAmount` — nguyên văn tên hằng của backend.
  final String type;

  final num discountValue;

  /// Ngưỡng tiền tối thiểu của ĐƠN, không phải điều kiện để khuyến mãi được liệt kê.
  ///
  /// Backend cố ý vẫn trả mã dù giỏ hiện tại chưa đủ tiền: giấu nó đi là giấu đúng thông tin
  /// khách cần để quyết định gọi thêm món.
  final num? minOrderAmount;

  final num? maxDiscountAmount;
  final bool isFlashSale;

  /// `null` nghĩa là không có hạn kết thúc — KHÔNG phải "đã hết hạn".
  final DateTime? endsAt;

  factory Promotion.fromJson(Map<String, dynamic> json) => Promotion(
        code: json['code'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        type: json['type'] as String,
        discountValue: json['discountValue'] as num,
        minOrderAmount: json['minOrderAmount'] as num?,
        maxDiscountAmount: json['maxDiscountAmount'] as num?,
        isFlashSale: (json['isFlashSale'] as bool?) ?? false,
        endsAt: json['endsAt'] == null
            ? null
            : DateTime.parse(json['endsAt'] as String).toUtc(),
      );
}

/// Mô tả mức giảm bằng câu người đọc được.
///
/// Tách khỏi widget để kiểm được: đây là chỗ dễ sai nhất của màn hình — nhầm phần trăm với số
/// tiền, hoặc quên trần giảm, đều dẫn tới việc hứa với khách một con số không đúng.
String moTaMucGiam(Promotion p) {
  final giam = p.type == 'Percentage'
      ? 'Giảm ${_soGon(p.discountValue)}%'
      : 'Giảm ${_tienVnd(p.discountValue)}';
  // Trần giảm chỉ có nghĩa với phần trăm. Với số tiền cố định nó không bao giờ ràng buộc, và nêu
  // ra sẽ khiến khách tưởng có thêm một giới hạn nữa.
  if (p.type == 'Percentage' && p.maxDiscountAmount != null) {
    return '$giam, tối đa ${_tienVnd(p.maxDiscountAmount!)}';
  }
  return giam;
}

/// Điều kiện tối thiểu, hoặc `null` nếu không có.
String? moTaDieuKien(Promotion p) {
  if (p.minOrderAmount == null || p.minOrderAmount == 0) return null;
  return 'Đơn từ ${_tienVnd(p.minOrderAmount!)}';
}

String _soGon(num n) =>
    n == n.roundToDouble() ? n.toInt().toString() : n.toString();

/// Định dạng tiền Việt: chấm ngăn nghìn, hậu tố đ.
///
/// Tự viết thay vì kéo `intl` vào: một phụ thuộc mới phải nâng cấp và kiểm mãi về sau, cho đúng
/// một hàm mười dòng. Nếu sau này cần đa ngôn ngữ thật thì đổi, và lúc đó lý do đã rõ ràng.
String _tienVnd(num n) {
  final s = n.round().abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return '${n < 0 ? '-' : ''}${buf.toString()}đ';
}
