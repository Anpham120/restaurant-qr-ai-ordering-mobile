/// Một ưu đãi khách đủ điểm để đổi.
class Reward {
  const Reward({
    required this.rewardId,
    required this.name,
    this.description,
    required this.pointsRequired,
  });

  final String rewardId;
  final String name;
  final String? description;
  final int pointsRequired;

  factory Reward.fromJson(Map<String, dynamic> json) => Reward(
        rewardId: json['rewardId'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        pointsRequired: json['pointsRequired'] as int,
      );
}

/// Điểm thưởng của chính tài khoản đang đăng nhập.
///
/// Ánh xạ `LoyaltyDtos.MyLoyaltyResponse`. Backend cố ý KHÔNG trả tổng chi tiêu — màn hình không
/// dùng tới, và trường nào không cần thì không gửi.
class MyLoyalty {
  const MyLoyalty({
    required this.linked,
    this.phoneNumber,
    required this.points,
    required this.availableRewards,
  });

  /// Tài khoản đã nối số điện thoại chưa.
  ///
  /// `false` là trạng thái BÌNH THƯỜNG của mọi tài khoản mới, không phải lỗi. Màn hình hiện lời
  /// mời liên kết chứ không hiện thông báo hỏng.
  final bool linked;

  final String? phoneNumber;
  final int points;
  final List<Reward> availableRewards;

  factory MyLoyalty.fromJson(Map<String, dynamic> json) => MyLoyalty(
        linked: (json['linked'] as bool?) ?? false,
        phoneNumber: json['phoneNumber'] as String?,
        points: (json['points'] as int?) ?? 0,
        availableRewards:
            ((json['availableRewards'] as List<dynamic>?) ?? const [])
                .map((e) => Reward.fromJson(e as Map<String, dynamic>))
                .toList(growable: false),
      );
}
