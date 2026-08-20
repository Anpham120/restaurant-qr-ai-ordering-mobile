/// Người dùng trả về kèm token. Ánh xạ đúng `AuthDtos.AuthUserResponse` của backend Java.
class AuthUser {
  const AuthUser({
    required this.userId,
    required this.fullName,
    required this.email,
    required this.role,
  });

  final String userId;
  final String fullName;
  final String email;
  final String role;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        userId: json['userId'] as String,
        fullName: json['fullName'] as String,
        email: json['email'] as String,
        role: json['role'] as String,
      );

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'fullName': fullName,
        'email': email,
        'role': role,
      };
}

/// Phiên đăng nhập đã lưu trên máy: token, hạn dùng, và người dùng.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.expiresAt,
    required this.user,
  });

  final String accessToken;

  /// Luôn giữ ở **UTC**. Backend trả `Instant` (ISO-8601, hậu tố `Z`); nếu để giờ máy thì một
  /// thiết bị đặt sai múi giờ sẽ tự cho là token còn hạn hoặc đã hết hạn sớm vài tiếng.
  final DateTime expiresAt;

  final AuthUser user;

  /// Khoảng lùi trước hạn.
  ///
  /// Token còn đúng 20 giây không dùng được: request bay đi, mạng 3G trong quán mất 2–3 giây,
  /// tới nơi thì token đã chết và người dùng nhận 401 giữa lúc đang đặt món. Coi như hết hạn
  /// sớm hơn một phút để phần gọi mạng luôn có token thật sự còn sống.
  static const Duration bienAnToan = Duration(minutes: 1);

  bool conHieuLuc(DateTime now) {
    return expiresAt.toUtc().subtract(bienAnToan).isAfter(now.toUtc());
  }

  /// KHÔNG in token ra.
  ///
  /// `toString()` của một object bị gọi ở những chỗ không ai ngờ: `print(session)` lúc gỡ lỗi,
  /// log của Flutter khi widget ném lỗi, và báo cáo sự cố gửi lên dịch vụ ngoài. Mặc định của
  /// Dart in tên lớp nên vốn đã an toàn, nhưng nó cũng vô dụng khi gỡ lỗi — nên viết lại thành
  /// bản có ích mà vẫn không lộ token, thay vì để người sau thêm token vào cho "dễ debug".
  @override
  String toString() =>
      'AuthSession(user: ${user.email}, role: ${user.role}, expiresAt: ${expiresAt.toIso8601String()})';

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        accessToken: json['accessToken'] as String,
        expiresAt: DateTime.parse(json['expiresAt'] as String).toUtc(),
        user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'user': user.toJson(),
      };
}
