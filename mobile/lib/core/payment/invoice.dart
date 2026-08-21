/// Dữ liệu để khách quét chuyển khoản. `null` khi phương thức không phải VietQR.
class VietQr {
  const VietQr({
    required this.amount,
    required this.transferContent,
    this.quickLink,
    this.qrImageDataUri,
  });

  final num amount;

  /// Nội dung chuyển khoản.
  ///
  /// KHÔNG được để khách sửa. Webhook Casso đối soát bằng đúng chuỗi này (#3); sửa một ký tự là
  /// tiền về mà hệ thống không nhận ra, và hoá đơn nằm chờ cho tới khi có người xử lý tay.
  final String transferContent;

  final String? quickLink;
  final String? qrImageDataUri;

  factory VietQr.fromJson(Map<String, dynamic> json) => VietQr(
        amount: (json['amount'] as num?) ?? 0,
        transferContent: (json['transferContent'] as String?) ?? '',
        quickLink: json['quickLink'] as String?,
        qrImageDataUri: json['qrImageDataUri'] as String?,
      );
}

class InvoiceLine {
  const InvoiceLine(
      {required this.name, required this.quantity, required this.lineTotal});

  final String name;
  final int quantity;
  final num lineTotal;

  factory InvoiceLine.fromJson(Map<String, dynamic> json) => InvoiceLine(
        name: (json['name'] as String?) ?? '',
        quantity: (json['quantity'] as int?) ?? 0,
        lineTotal: (json['lineTotal'] as num?) ?? 0,
      );
}

class Invoice {
  const Invoice({
    required this.invoiceCode,
    required this.status,
    required this.method,
    required this.subtotalAmount,
    required this.discountAmount,
    required this.totalAmount,
    required this.items,
    this.vietQr,
  });

  final String invoiceCode;

  /// `NotRequested` · `Pending` · `Paid` · `Cancelled`.
  final String status;

  /// `Unselected` · `COD` · `VietQR`.
  final String method;

  final num subtotalAmount;
  final num discountAmount;
  final num totalAmount;
  final List<InvoiceLine> items;
  final VietQr? vietQr;

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
        invoiceCode: (json['invoiceCode'] as String?) ?? '',
        status: (json['status'] as String?) ?? 'NotRequested',
        method: (json['method'] as String?) ?? 'Unselected',
        subtotalAmount: (json['subtotalAmount'] as num?) ?? 0,
        discountAmount: (json['discountAmount'] as num?) ?? 0,
        totalAmount: (json['totalAmount'] as num?) ?? 0,
        items: ((json['items'] as List<dynamic>?) ?? const [])
            .map((e) => InvoiceLine.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        vietQr: json['vietQr'] == null
            ? null
            : VietQr.fromJson(json['vietQr'] as Map<String, dynamic>),
      );
}

/// Nhãn tiếng Việt cho trạng thái hoá đơn.
///
/// `Pending` ở đây nghĩa là ĐÃ YÊU CẦU và đang chờ tiền/xác nhận — khác hẳn `Pending` của một
/// MÓN (chờ nấu). Ba nghĩa của cùng một chữ trong cùng một hệ thống là lý do mỗi cấp có hàm nhãn
/// riêng thay vì một hàm dùng chung.
String nhanTrangThaiHoaDon(String status) {
  switch (status) {
    case 'NotRequested':
      return 'Chưa yêu cầu thanh toán';
    case 'Pending':
      return 'Đang chờ xác nhận';
    case 'Paid':
      return 'Đã thanh toán';
    case 'Cancelled':
      return 'Yêu cầu đã huỷ';
    default:
      return status;
  }
}

/// Câu nói cho khách biết CHUYỆN GÌ ĐANG XẢY RA sau khi bấm thanh toán.
///
/// Khách KHÔNG tự xác nhận được — đo thật: `POST .../payment/confirm` bằng token bàn trả 401, vì
/// endpoint đó chỉ dành cho nhân viên quầy. Nên sau khi yêu cầu, việc duy nhất app làm được là
/// nói đúng ai sẽ xác nhận và bằng cách nào. Một nút "Tôi đã trả" ở đây sẽ không làm gì, và
/// khách bấm rồi tưởng xong.
String huongDanChoXacNhan(String method) {
  switch (method) {
    case 'COD':
      return 'Mời bạn trả tiền mặt tại quầy. Nhân viên xác nhận xong thì hoá đơn tự cập nhật.';
    case 'VietQR':
      return 'Quét mã và chuyển đúng số tiền, GIỮ NGUYÊN nội dung chuyển khoản. '
          'Hệ thống tự nhận khi tiền về.';
    default:
      return 'Chọn cách thanh toán để tiếp tục.';
  }
}
