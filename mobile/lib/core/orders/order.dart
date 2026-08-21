class OrderItem {
  const OrderItem({
    required this.orderItemId,
    required this.menuItemId,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
    required this.status,
    this.estimatedReadyMinutesLow,
    this.estimatedReadyMinutesHigh,
  });

  final String orderItemId;

  /// Cần cho việc đặt lại món cũ (#33): giỏ hàng nhận `menuItemId`, không nhận `orderItemId`.
  final String menuItemId;

  final String name;
  final int quantity;
  final num unitPrice;
  final num lineTotal;
  final String status;

  /// Ước lượng thời gian còn lại, dạng KHOẢNG. `null` khi backend chưa đủ mẫu (hạn chế #10) —
  /// đó là trạng thái bình thường, xem [moTaUocLuong].
  final int? estimatedReadyMinutesLow;
  final int? estimatedReadyMinutesHigh;

  factory OrderItem.fromJson(Map<String, dynamic> json) => OrderItem(
        orderItemId: (json['orderItemId'] as String?) ?? '',
        menuItemId: (json['menuItemId'] as String?) ?? '',
        name: json['name'] as String,
        quantity: (json['quantity'] as int?) ?? 0,
        unitPrice: (json['unitPrice'] as num?) ?? 0,
        lineTotal: (json['lineTotal'] as num?) ?? 0,
        status: (json['status'] as String?) ?? 'Pending',
        estimatedReadyMinutesLow: json['estimatedReadyMinutesLow'] as int?,
        estimatedReadyMinutesHigh: json['estimatedReadyMinutesHigh'] as int?,
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

/// Câu mô tả thời gian chờ, hoặc `null` khi backend không đưa ra ước lượng.
///
/// **Trả `null` là trạng thái BÌNH THƯỜNG, không phải lỗi.** Backend chỉ ước lượng khi món đã có
/// từ 20 mẫu lịch sử trở lên (hạn chế #10); dưới ngưỡng đó nó trả `null` thay vì đoán. Đo trên hệ
/// thống đang chạy: hiện chưa món nào đủ mẫu, nên mọi món đều `null`.
///
/// App **TUYỆT ĐỐI KHÔNG** được bịa câu thay thế kiểu "khoảng 15 phút". Cả ba điều kiện của #10
/// (ngưỡng mẫu, hiện dạng khoảng, cộng độ sâu hàng đợi bếp) tồn tại vì nhóm gốc đã cố ý không làm
/// tính năng này — "một ước lượng sai làm mất lòng tin hơn là không có ước lượng". Một con số bịa
/// ở tầng app phá đúng ba điều kiện đó mà không ai thấy.
String? moTaUocLuong(int? low, int? high) {
  if (low == null || high == null) return null;
  if (high <= low) return 'khoảng $low phút';
  return '$low–$high phút';
}

/// Khách có tự huỷ được món này không (hạn chế #11).
///
/// Hai điều kiện, và cả hai đều bắt buộc:
///
/// - **Món phải đang `Pending`.** Backend chặt hơn đường của nhân viên có chủ ý: nhân viên vẫn
///   huỷ được món `Preparing`, khách thì không, vì tới lúc đó bếp đã dùng nguyên liệu.
/// - **App phải có `X-Order-Token` của ĐÚNG đơn đó.** Token này backend chỉ trả một lần, lúc tạo
///   đơn. Đơn do máy khác trong bàn đặt thì máy này không có token, nên không huỷ hộ được — và
///   đó là đúng: người đặt mới là người quyết định huỷ.
///
/// Khoá theo TỪNG MÓN, không theo cả đơn: khách huỷ được món chưa ai đụng tới ngay cả khi món
/// khác cùng đơn đã lên bếp.
bool chophepHuyMon(String trangThaiMon, {required bool coTokenDon}) =>
    trangThaiMon == 'Pending' && coTokenDon;
