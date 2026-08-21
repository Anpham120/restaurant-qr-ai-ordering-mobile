/// Phiên bàn đang mở.
///
/// Ánh xạ `TableDtos.OpenTableSessionResponse` của backend Java. Chỉ giữ những trường app dùng —
/// thêm trường "cho đủ" nghĩa là thêm chỗ để hỏng khi backend đổi mà không ai thấy lợi ích.
class TableSession {
  const TableSession({
    required this.sessionId,
    required this.tableCode,
    required this.tableDisplayName,
    required this.status,
    required this.expiresAt,
    required this.isExpired,
    required this.tableSessionToken,
    required this.resumeState,
    required this.qrToken,
  });

  final String sessionId;
  final String tableCode;
  final String tableDisplayName;
  final String status;

  /// Giữ ở UTC, cùng lý do như `AuthSession.expiresAt`.
  final DateTime expiresAt;

  final bool isExpired;

  /// Chìa khoá năng lực cho mọi lời gọi sau của phiên này (`X-Table-Session-Token`).
  final String tableSessionToken;

  /// Backend đã tính sẵn app nên mở màn nào (V51/V52) — app KHÔNG tự suy lại.
  ///
  /// Suy lại ở phía client nghĩa là hai nơi cùng quyết định một việc, và chúng sẽ lệch nhau đúng
  /// vào lúc khó tái hiện nhất: khách quay lại giữa chừng một đơn đang nấu.
  final String resumeState;

  /// Mã QR đã dùng để mở phiên này.
  ///
  /// KHÔNG có trong phản hồi của backend — app tự giữ lại thứ chính mình đã gửi. Cần nó vì
  /// POST /api/orders đòi CẢ tableCode LẪN qrToken cho đơn tại bàn; thiếu là 400
  /// DINE_IN_TABLE_REQUIRED hoặc QR_TOKEN_INVALID.
  ///
  /// Phải cất cùng phiên chứ không giữ trong bộ nhớ tạm: khách mở lại app rồi đặt món là luồng
  /// bình thường, và lúc đó mã QR đã trôi mất nếu chỉ nằm ở màn hình vào bàn.
  final String qrToken;

  bool conHieuLuc(DateTime now) =>
      !isExpired && expiresAt.toUtc().isAfter(now.toUtc());

  /// KHÔNG in `tableSessionToken` — cùng lý do như `AuthSession.toString()`.
  @override
  String toString() =>
      'TableSession($tableCode, status: $status, resumeState: $resumeState, expiresAt: ${expiresAt.toIso8601String()})';

  factory TableSession.fromJson(Map<String, dynamic> json) => TableSession(
        sessionId: json['sessionId'] as String,
        tableCode: json['tableCode'] as String,
        tableDisplayName: (json['tableDisplayName'] as String?) ??
            json['tableCode'] as String,
        status: json['status'] as String,
        expiresAt: DateTime.parse(json['expiresAt'] as String).toUtc(),
        isExpired: (json['isExpired'] as bool?) ?? false,
        tableSessionToken: json['tableSessionToken'] as String,
        resumeState: (json['resumeState'] as String?) ?? 'Unknown',
        qrToken: (json['qrToken'] as String?) ?? '',
      );

  Map<String, dynamic> toJson() => {
        'sessionId': sessionId,
        'tableCode': tableCode,
        'tableDisplayName': tableDisplayName,
        'status': status,
        'expiresAt': expiresAt.toUtc().toIso8601String(),
        'isExpired': isExpired,
        'tableSessionToken': tableSessionToken,
        'resumeState': resumeState,
        'qrToken': qrToken,
      };
}
