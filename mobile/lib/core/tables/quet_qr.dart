/// Thứ đọc được từ một mã QR đặt trên bàn.
class MaQrBan {
  const MaQrBan({required this.qrToken, this.tableCode});

  /// Token bắt buộc để mở phiên. Máy chủ đòi nó và **không bao giờ trả nó về**
  /// (`GET /api/tables/qr/{token}` cố ý chỉ trả tableCode và displayName), nên mã QR là nguồn duy
  /// nhất có nó.
  final String qrToken;

  /// Mã bàn, nếu QR có. Không bắt buộc: máy chủ tự tra ra bàn từ token.
  final String? tableCode;
}

/// Phân tích nội dung quét được từ camera.
///
/// Mã QR trên bàn do web sinh ra, mã hoá một ĐƯỜNG DẪN chứ không phải token trần —
/// `AdminTableService.buildCustomerPath` dựng nó thành:
///
///     https://order.cmcrestaurant.app/table/T01?qr=cmc-table-t01-qr
///
/// Nên bộ quét không thể lấy nguyên chuỗi quét được làm token: làm thế sẽ gửi cả URL lên máy chủ
/// và nhận `QR_NOT_FOUND` cho một mã QR hoàn toàn hợp lệ.
///
/// Vẫn nhận **token trần** (`cmc-table-t01-qr`) vì hai lý do thật: ô nhập tay trong app dùng đúng
/// dạng đó, và một quán có thể in mã cũ chỉ chứa token.
///
/// Trả `null` khi không tìm được token — màn hình quét sẽ tiếp tục quét thay vì gửi rác lên máy
/// chủ.
MaQrBan? phanTichQrBan(String? quetDuoc) {
  final s = quetDuoc?.trim();
  if (s == null || s.isEmpty) return null;

  final uri = Uri.tryParse(s);
  final laUrl = uri != null && (uri.scheme == 'http' || uri.scheme == 'https');

  if (laUrl) {
    final token = uri.queryParameters['qr']?.trim();
    if (token == null || token.isEmpty) {
      // URL không kèm ?qr= thì thiếu đúng thứ bắt buộc. Trả null thay vì đoán, vì đoán ở đây
      // nghĩa là gửi một token sai lên máy chủ và nhận lỗi khó hiểu.
      return null;
    }
    // Đường dẫn dạng /table/{maBan}. Lấy đoạn ngay sau "table" thay vì đoạn cuối: một ngày nào đó
    // đường dẫn dài thêm thì đoạn cuối không còn là mã bàn.
    String? maBan;
    final doan = uri.pathSegments;
    final i = doan.indexOf('table');
    if (i >= 0 && i + 1 < doan.length && doan[i + 1].trim().isNotEmpty) {
      maBan = Uri.decodeComponent(doan[i + 1]).trim();
    }
    return MaQrBan(qrToken: token, tableCode: maBan);
  }

  // Không phải URL. Chỉ nhận khi trông như một token: không khoảng trắng, không xuống dòng.
  // Không lọc thì mọi mã QR khác trên đời (danh thiếp, wifi, link ví điện tử) đều được gửi lên
  // máy chủ như một token.
  if (RegExp(r'^[A-Za-z0-9._:-]{4,100}$').hasMatch(s)) {
    return MaQrBan(qrToken: s);
  }
  return null;
}
