class OrderItem {
  const OrderItem({
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    required this.status,
  });

  final String name;
  final int quantity;
  final num unitPrice;
  final num lineTotal;
  final String status;

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
        name: json['name'] as String,
        quantity: (json['quantity'] as int?) ?? 0,
        unitPrice: (json['unitPrice'] as num?) ?? 0,
        lineTotal: (json['lineTotal'] as num?) ?? 0,
        status: (json['status'] as String?) ?? 'Pending',
      );
}

class CustomerOrder {
  const CustomerOrder({
    required this.orderId,
    required this.orderCode,
    required this.status,
    required this.totalAmount,
    required this.createdAt,
    required this.items,
  });

  final String orderId;
  final String orderCode;
  final String status;
  final num totalAmount;
  final DateTime createdAt;
  final List<OrderItem> items;

  factory CustomerOrder.fromJson(Map<String, dynamic> json) => CustomerOrder(
        orderId: json['orderId'] as String,
        orderCode: (json['orderCode'] as String?) ?? '',
        status: (json['status'] as String?) ?? 'Placed',
        totalAmount: (json['totalAmount'] as num?) ?? 0,
        createdAt: DateTime.parse(json['createdAt'] as String).toUtc(),
        items: ((json['items'] as List<dynamic>?) ?? const [])
            .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
}

/// Nhãn tiếng Việt cho trạng thái đơn.
///
/// Tách thành hàm thuần vì đây là chỗ dễ nói sai nhất với khách: `Ready` nghĩa là bếp đã nấu xong
/// và món đang chờ mang ra, KHÔNG phải "đã xong bữa". Dịch nó thành "Hoàn tất" sẽ khiến khách
/// tưởng có thể đứng dậy đi về.
///
/// Trạng thái LẠ trả về nguyên văn thay vì một câu chung chung. Backend có thể thêm trạng thái
/// mới trước khi app kịp cập nhật; hiện "Đang xử lý" cho mọi thứ chưa biết sẽ giấu mất chuyện đó
/// và không ai phát hiện app đã lạc hậu.
String nhanTrangThaiDon(String status) {
  switch (status) {
    case 'Draft':
      return 'Nháp';
    case 'Placed':
      return 'Đã gửi bếp';
    case 'Confirmed':
      return 'Bếp đã nhận';
    case 'Preparing':
      return 'Đang nấu';
    case 'Ready':
      return 'Nấu xong, chờ mang ra';
    case 'Served':
      return 'Đã mang ra bàn';
    case 'Completed':
      return 'Đã thanh toán';
    case 'Cancelled':
      return 'Đã huỷ';
    default:
      return status;
  }
}

/// Nhãn tiếng Việt cho trạng thái từng món.
///
/// `Pending` ở cấp MÓN nghĩa là chưa ai bắt đầu nấu — khác hẳn `Pending` ở cấp thanh toán (chờ
/// thu tiền). Dùng chung một chữ cho hai nghĩa là cách nhanh nhất để hiểu nhầm.
String nhanTrangThaiMon(String status) {
  switch (status) {
    case 'Pending':
      return 'Chờ nấu';
    case 'Preparing':
      return 'Đang nấu';
    case 'Ready':
      return 'Nấu xong';
    case 'Served':
      return 'Đã mang ra';
    case 'Cancelled':
      return 'Đã huỷ';
    default:
      return status;
  }
}

/// Đơn đã kết thúc chưa — dùng để tách phần "đang phục vụ" khỏi phần lịch sử.
bool donDaXong(String status) => status == 'Completed' || status == 'Cancelled';
