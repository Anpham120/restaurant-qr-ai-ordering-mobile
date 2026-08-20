import 'package:flutter_test/flutter_test.dart';
import 'package:restaurant_mobile/core/auth/auth_session.dart';

AuthSession phien(
        {required DateTime hetHan, String token = 'jwt.rat.bi.mat'}) =>
    AuthSession(
      accessToken: token,
      expiresAt: hetHan,
      user: const AuthUser(
        userId: 'u1',
        fullName: 'Nguyễn Văn A',
        email: 'a@example.com',
        role: 'Customer',
      ),
    );

void main() {
  final moc = DateTime.utc(2026, 8, 20, 12, 0, 0);

  group('AuthSession.conHieuLuc', () {
    test('token còn hạn dài thì hợp lệ', () {
      expect(phien(hetHan: moc.add(const Duration(hours: 2))).conHieuLuc(moc),
          isTrue);
    });

    test('token đã quá hạn thì không hợp lệ', () {
      expect(
          phien(hetHan: moc.subtract(const Duration(minutes: 1)))
              .conHieuLuc(moc),
          isFalse);
    });

    test('token SẮP hết hạn (20 giây nữa) bị coi là hết hạn', () {
      // Đây là lý do tồn tại của biên an toàn. Bỏ biên đi thì ca này xanh trở lại nhưng người
      // dùng nhận 401 giữa lúc gửi đơn: request bay đi lúc token còn sống, tới nơi thì đã chết.
      expect(
          phien(hetHan: moc.add(const Duration(seconds: 20))).conHieuLuc(moc),
          isFalse);
    });

    test('so sánh theo UTC, không theo giờ máy', () {
      // Máy đặt sai múi giờ là chuyện có thật. Nếu so theo giờ địa phương, cùng một token sẽ
      // "còn hạn" ở múi này và "hết hạn" ở múi kia.
      final hetHanGioDiaPhuong = moc.add(const Duration(hours: 2)).toLocal();
      expect(phien(hetHan: hetHanGioDiaPhuong).conHieuLuc(moc), isTrue);
    });
  });

  group('không lộ token', () {
    test('toString() KHÔNG chứa access token', () {
      final s = phien(hetHan: moc, token: 'CHUOI_BI_MAT_KHONG_DUOC_IN');
      expect(s.toString(), isNot(contains('CHUOI_BI_MAT_KHONG_DUOC_IN')));
    });

    test('toString() vẫn đủ dùng để gỡ lỗi', () {
      // Nếu không kiểm điều này thì cách "an toàn" nhất là trả chuỗi rỗng, và người sau sẽ thêm
      // token vào cho dễ debug. Giữ nó vừa an toàn vừa có ích thì mới không bị sửa ngược.
      final s = phien(hetHan: moc);
      expect(s.toString(), contains('a@example.com'));
      expect(s.toString(), contains('Customer'));
    });
  });

  group('JSON', () {
    test('đi và về giữ nguyên token, hạn (UTC) và người dùng', () {
      final goc = phien(hetHan: moc.add(const Duration(hours: 3)));
      final ve = AuthSession.fromJson(goc.toJson());
      expect(ve.accessToken, goc.accessToken);
      expect(ve.expiresAt.isUtc, isTrue);
      expect(ve.expiresAt, goc.expiresAt);
      expect(ve.user.email, 'a@example.com');
      expect(ve.user.role, 'Customer');
    });

    test('chịu được Instant 9 chữ số thập phân — dạng backend THẬT trả về', () {
      // Đo từ backend Java đang chạy, không phải đoán:
      //
      //     "expiresAt":"2026-08-20T15:24:15.752877577Z"
      //
      // Instant của Java in tới nanosecond; DateTime của Dart chỉ tới microsecond nên cắt bớt 3
      // chữ số cuối. Ca này chốt rằng việc cắt đó không ném lỗi và không lệch giây.
      //
      // Bản đầu tôi viết test bằng chuỗi gọn tự nghĩ ra ("...:05Z"), tức đang kiểm app với dữ
      // liệu do chính app tưởng tượng chứ không phải dữ liệu máy chủ thật gửi.
      final ve = AuthSession.fromJson(const {
        'accessToken': 'abc',
        'expiresAt': '2026-08-20T15:24:15.752877577Z',
        'user': {
          'userId': 'u1',
          'fullName': 'Nguyễn Văn A',
          'email': 'a@example.com',
          'role': 'Customer',
        },
      });
      expect(ve.expiresAt.isUtc, isTrue);
      expect(ve.expiresAt, DateTime.utc(2026, 8, 20, 15, 24, 15, 752, 877));
    });
  });
}
