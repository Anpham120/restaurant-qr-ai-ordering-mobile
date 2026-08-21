class CartItem {
  const CartItem({
    required this.menuItemId,
    required this.name,
    required this.price,
    required this.quantity,
    required this.lineTotal,
    required this.isAvailable,
    this.imageUrl,
    this.note,
  });

  final String menuItemId;
  final String name;
  final num price;
  final int quantity;
  final num lineTotal;

  /// Món có thể bị BẾP TẮT sau khi khách đã bỏ vào giỏ. Backend vẫn trả dòng đó kèm cờ này thay
  /// vì lặng lẽ xoá — khách cần thấy món biến mất vì lý do gì.
  final bool isAvailable;

  final String? imageUrl;
  final String? note;

  factory CartItem.fromJson(Map<String, dynamic> json) => CartItem(
        menuItemId: json['menuItemId'] as String,
        name: json['name'] as String,
        price: (json['price'] as num?) ?? 0,
        quantity: (json['quantity'] as int?) ?? 0,
        lineTotal: (json['lineTotal'] as num?) ?? 0,
        isAvailable: (json['isAvailable'] as bool?) ?? true,
        imageUrl: json['imageUrl'] as String?,
        note: json['note'] as String?,
      );
}

class Cart {
  const Cart({
    required this.tableSessionId,
    required this.items,
    required this.itemCount,
    required this.subtotal,
  });

  final String tableSessionId;
  final List<CartItem> items;
  final int itemCount;
  final num subtotal;

  bool get rong => items.isEmpty;

  factory Cart.fromJson(Map<String, dynamic> json) => Cart(
        tableSessionId: (json['tableSessionId'] as String?) ?? '',
        items: ((json['items'] as List<dynamic>?) ?? const [])
            .map((e) => CartItem.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        itemCount: (json['itemCount'] as int?) ?? 0,
        subtotal: (json['subtotal'] as num?) ?? 0,
      );
}

/// Có món nào trong giỏ đã bị bếp tắt không.
///
/// Chặn đặt đơn khi còn món hết là việc của app, không phải của backend: backend sẽ từ chối cả
/// đơn với `MENU_ITEM_UNAVAILABLE`, và một lời từ chối ở bước cuối sau khi khách đã bấm "Đặt món"
/// tệ hơn nhiều so với việc chỉ ra ngay trong giỏ.
bool coMonHetHang(Cart cart) => cart.items.any((i) => !i.isAvailable);

/// Dấu vết nội dung giỏ — dùng để biết khi nào phải đổi khoá idempotency.
///
/// Chỉ gồm những thứ ĐI VÀO thân request tạo đơn: mã món và số lượng. Không gồm giá hay thời điểm
/// cập nhật — giá đổi không làm đơn thành đơn khác, và nếu tính vào thì mỗi lần quán sửa giá sẽ
/// vô hiệu hoá khoá đang chờ gửi lại.
///
/// Sắp theo mã món để thứ tự backend trả về không ảnh hưởng kết quả.
String dauVetGio(Cart cart) {
  final phan = cart.items
      .map((i) => '${i.menuItemId}:${i.quantity}')
      .toList(growable: false)
    ..sort();
  return phan.join(',');
}
