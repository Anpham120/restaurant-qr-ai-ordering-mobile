import 'dart:math';

/// Giữ khoá `Idempotency-Key` cho một lần đặt đơn.
///
/// Vì sao cần cả một lớp cho việc này:
///
/// `POST /api/orders` BẮT BUỘC có `Idempotency-Key`, và backend xử lý nó rất rõ ràng — cùng khoá
/// với cùng nội dung thì trả lại chính đơn cũ; cùng khoá với nội dung KHÁC thì
/// `409 IDEMPOTENCY_KEY_REUSED`. Nên hai cách làm sai đều dẫn tới hậu quả thật:
///
/// - **Sinh khoá mới mỗi lần gửi** → mạng chập chờn, khách bấm lại, và bếp nhận HAI đơn giống hệt
///   nhau. Đây đúng là tình huống `Idempotency-Key` sinh ra để chặn, nên sinh khoá mới lúc gửi
///   lại là vô hiệu hoá nó trong khi vẫn gửi header cho có.
/// - **Giữ nguyên khoá sau khi giỏ đổi** → khách thêm một món rồi bấm đặt, và nhận 409 khó hiểu.
///
/// Nên luật đúng là: khoá gắn với NỘI DUNG GIỎ, không gắn với lần bấm. Giỏ không đổi thì gửi lại
/// bao nhiêu lần cũng cùng một khoá; giỏ đổi thì khoá mới.
class KhoaDatDon {
  KhoaDatDon({Random? ngauNhien}) : _ngauNhien = ngauNhien ?? Random.secure();

  final Random _ngauNhien;
  String? _khoa;
  String? _dauVet;

  /// Khoá cho giỏ có dấu vết [dauVet].
  String khoaCho(String dauVet) {
    if (_khoa == null || _dauVet != dauVet) {
      _khoa = _sinhKhoa();
      _dauVet = dauVet;
    }
    return _khoa!;
  }

  /// Quên khoá sau khi đơn đã tạo xong.
  ///
  /// Không quên thì lần đặt SAU với giỏ trùng nội dung (khách gọi thêm đúng món cũ — chuyện rất
  /// thường) sẽ dùng lại khoá cũ và backend trả về chính đơn cũ. Khách bấm đặt, thấy "thành công",
  /// mà bếp không nhận gì thêm.
  void quen() {
    _khoa = null;
    _dauVet = null;
  }

  /// Sinh khoá hợp lệ theo đúng ràng buộc của backend: `^[A-Za-z0-9._:-]+$`, tối đa 100 ký tự.
  ///
  /// Dùng bảng chữ cái an toàn thay vì UUID có dấu gạch nối cho chắc — dấu `-` hợp lệ, nhưng một
  /// định dạng tự sinh nằm gọn trong tập ký tự cho phép thì không bao giờ phải nhớ lại điều đó.
  String _sinhKhoa() {
    const bang =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final buf = StringBuffer('ord.');
    for (var i = 0; i < 24; i++) {
      buf.write(bang[_ngauNhien.nextInt(bang.length)]);
    }
    return buf.toString();
  }
}

/// Khoá có hợp lệ với backend không — chép đúng `RequestIdempotency.KEY_PATTERN`.
///
/// Tách ra để kiểm được: một khoá lọt ký tự lạ sẽ bị trả `400 IDEMPOTENCY_KEY_INVALID` và khách
/// không đặt được món nào cả, trong khi mã app trông vẫn đúng.
final RegExp mauKhoaHopLe = RegExp(r'^[A-Za-z0-9._:-]+$');

bool khoaHopLe(String khoa) =>
    khoa.isNotEmpty && khoa.length <= 100 && mauKhoaHopLe.hasMatch(khoa);
