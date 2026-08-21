/// Một món AI gợi ý thêm vào giỏ.
///
/// Backend CHỈ chuyển tiếp gợi ý có `requiresCustomerConfirmation == true` (`ChatService
/// .toCartActions` lọc thẳng). Nên mọi gợi ý app nhận được đều là "hỏi khách", không phải "đã
/// thêm". App **tuyệt đối không tự thêm vào giỏ**: đó là tiêu tiền của khách theo lời một mô hình
/// ngôn ngữ.
class GoiYThemMon {
  const GoiYThemMon({
    required this.menuItemId,
    required this.name,
    required this.price,
    required this.quantity,
    this.reason,
  });

  final String menuItemId;
  final String name;
  final num price;
  final int quantity;

  /// Vì sao AI gợi ý món này. Hiện ra để khách tự đánh giá thay vì tin thẳng.
  final String? reason;

  factory GoiYThemMon.fromJson(Map<String, dynamic> json) => GoiYThemMon(
        menuItemId: json['menuItemId'] as String,
        name: (json['name'] as String?) ?? '',
        price: (json['price'] as num?) ?? 0,
        quantity: (json['quantity'] as int?) ?? 1,
        reason: json['reason'] as String?,
      );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.goiY,
  });

  final String id;

  /// `user` hoặc `assistant`.
  final String role;

  final String content;
  final List<GoiYThemMon> goiY;

  bool get cuaKhach => role == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: (json['id'] as String?) ?? '',
        role: (json['role'] as String?) ?? 'assistant',
        content: (json['content'] as String?) ?? '',
        goiY: ((json['suggestedCartActions'] as List<dynamic>?) ?? const [])
            .map((e) => GoiYThemMon.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
}

/// Phiên chat đã mở.
class ChatSession {
  const ChatSession({
    required this.chatSessionId,
    required this.accessToken,
    required this.reused,
    required this.messages,
  });

  final String chatSessionId;

  /// `X-Chat-Session-Token` — chìa khoá năng lực cho mọi lời gọi sau.
  final String accessToken;

  /// `true` khi bàn đã có phiên chat và backend dùng lại nó.
  ///
  /// Quan trọng với app: dùng lại nghĩa là lịch sử đã có sẵn, nên KHÔNG được xoá màn hình rồi
  /// chào lại từ đầu — khách quay lại giữa cuộc trò chuyện của chính mình.
  final bool reused;

  final List<ChatMessage> messages;

  /// KHÔNG in `accessToken`, cùng lý do như các token khác.
  @override
  String toString() =>
      'ChatSession($chatSessionId, reused: $reused, messages: ${messages.length})';

  factory ChatSession.fromJson(Map<String, dynamic> json) => ChatSession(
        chatSessionId: json['chatSessionId'] as String,
        accessToken: (json['accessToken'] as String?) ?? '',
        reused: (json['reused'] as bool?) ?? false,
        messages: ((json['messages'] as List<dynamic>?) ?? const [])
            .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
}

/// Kết quả một lượt hỏi đáp.
class LuotChat {
  const LuotChat({
    required this.tinKhach,
    required this.traLoi,
    required this.goiY,
    required this.canGoiNhanVien,
    required this.guardrailFlags,
  });

  /// Tin nhắn của khách, do BACKEND trả về.
  ///
  /// Dùng bản của backend chứ không dùng bản app tự dựng: id và thời điểm do máy chủ quyết định,
  /// và bản Java trước đây trả một trường `content` duy nhất khiến cả hai phía đều `undefined` và
  /// hội thoại vỡ ngay lượt đầu (ghi trong `ChatDtos`).
  final ChatMessage tinKhach;

  final ChatMessage traLoi;
  final List<GoiYThemMon> goiY;

  /// AI tự nhận thấy nên chuyển cho người thật.
  final bool canGoiNhanVien;

  final List<String> guardrailFlags;

  factory LuotChat.fromJson(Map<String, dynamic> json) => LuotChat(
        tinKhach:
            ChatMessage.fromJson(json['userMessage'] as Map<String, dynamic>),
        traLoi: ChatMessage.fromJson(json['message'] as Map<String, dynamic>),
        goiY: ((json['suggestedCartActions'] as List<dynamic>?) ?? const [])
            .map((e) => GoiYThemMon.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        canGoiNhanVien: (json['suggestStaffHandoff'] as bool?) ?? false,
        guardrailFlags: ((json['guardrailFlags'] as List<dynamic>?) ?? const [])
            .map((e) => e.toString())
            .toList(growable: false),
      );
}

/// Giới hạn độ dài câu hỏi, chép đúng `MAX_QUESTION_LENGTH` của backend.
///
/// Chặn ở app để khách biết ngay khi gõ, thay vì gõ xong 2500 ký tự rồi mới nhận
/// `CHAT_MESSAGE_TOO_LONG`.
const int gioiHanDoDaiCauHoi = 2000;

/// Câu hỏi gửi được không.
///
/// Rỗng hoặc chỉ khoảng trắng thì KHÔNG gửi — backend trả `CHAT_MESSAGE_EMPTY`, và một lượt hỏng
/// vẫn tính vào hạn mức 10 tin/phút.
bool cauHoiGuiDuoc(String noiDung) {
  final s = noiDung.trim();
  return s.isNotEmpty && s.length <= gioiHanDoDaiCauHoi;
}
