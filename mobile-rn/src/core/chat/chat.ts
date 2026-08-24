/**
 * Một món AI gợi ý thêm vào giỏ.
 *
 * Backend CHỈ chuyển tiếp gợi ý có `requiresCustomerConfirmation == true`
 * (`ChatService.toCartActions` lọc thẳng). Nên mọi gợi ý app nhận được đều là "hỏi khách", không
 * phải "đã thêm". App **tuyệt đối không tự thêm vào giỏ**: đó là tiêu tiền của khách theo lời một
 * mô hình ngôn ngữ.
 */
export interface GoiYThemMon {
  readonly menuItemId: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
  /** Vì sao AI gợi ý món này. Hiện ra để khách tự đánh giá thay vì tin thẳng. */
  readonly reason: string | null;
}

export interface ChatMessage {
  readonly id: string;
  /** `user` hoặc `assistant`. */
  readonly role: string;
  readonly content: string;
  readonly goiY: readonly GoiYThemMon[];
}

export function cuaKhach(m: ChatMessage): boolean {
  return m.role === 'user';
}

/** Phiên chat đã mở. */
export interface ChatSession {
  readonly chatSessionId: string;
  /** `X-Chat-Session-Token` — chìa khoá năng lực cho mọi lời gọi sau. */
  readonly accessToken: string;
  /**
   * `true` khi bàn đã có phiên chat và backend dùng lại nó.
   *
   * Quan trọng với app: dùng lại nghĩa là lịch sử đã có sẵn, nên KHÔNG được xoá màn hình rồi chào
   * lại từ đầu — khách quay lại giữa cuộc trò chuyện của chính mình.
   */
  readonly reused: boolean;
  readonly messages: readonly ChatMessage[];
}

/** Kết quả một lượt hỏi đáp. */
export interface LuotChat {
  /**
   * Tin nhắn của khách, do BACKEND trả về.
   *
   * Dùng bản của backend chứ không dùng bản app tự dựng: id và thời điểm do máy chủ quyết định,
   * và bản Java trước đây trả một trường `content` duy nhất khiến cả hai phía đều `undefined` và
   * hội thoại vỡ ngay lượt đầu (ghi trong `ChatDtos`).
   */
  readonly tinKhach: ChatMessage;
  readonly traLoi: ChatMessage;
  readonly goiY: readonly GoiYThemMon[];
  /** AI tự nhận thấy nên chuyển cho người thật. */
  readonly canGoiNhanVien: boolean;
  readonly guardrailFlags: readonly string[];
}

function goiYTuMang(v: unknown): GoiYThemMon[] {
  return Array.isArray(v) ? v.map(goiYTuJson) : [];
}

export function goiYTuJson(json: unknown): GoiYThemMon {
  const o = json as Record<string, unknown>;
  return {
    menuItemId: o.menuItemId as string,
    name: typeof o.name === 'string' ? o.name : '',
    price: typeof o.price === 'number' ? o.price : 0,
    quantity: typeof o.quantity === 'number' ? o.quantity : 1,
    reason: typeof o.reason === 'string' ? o.reason : null,
  };
}

export function chatMessageTuJson(json: unknown): ChatMessage {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    id: typeof o.id === 'string' ? o.id : '',
    role: typeof o.role === 'string' ? o.role : 'assistant',
    content: typeof o.content === 'string' ? o.content : '',
    goiY: goiYTuMang(o.suggestedCartActions),
  };
}

export function chatSessionTuJson(json: unknown): ChatSession {
  const o = json as Record<string, unknown>;
  return {
    chatSessionId: o.chatSessionId as string,
    accessToken: typeof o.accessToken === 'string' ? o.accessToken : '',
    reused: typeof o.reused === 'boolean' ? o.reused : false,
    messages: Array.isArray(o.messages) ? o.messages.map(chatMessageTuJson) : [],
  };
}

export function luotChatTuJson(json: unknown): LuotChat {
  const o = json as Record<string, unknown>;
  return {
    tinKhach: chatMessageTuJson(o.userMessage),
    traLoi: chatMessageTuJson(o.message),
    goiY: goiYTuMang(o.suggestedCartActions),
    canGoiNhanVien: typeof o.suggestStaffHandoff === 'boolean' ? o.suggestStaffHandoff : false,
    guardrailFlags: Array.isArray(o.guardrailFlags) ? o.guardrailFlags.map(String) : [],
  };
}

/** KHÔNG in `accessToken`, cùng lý do như các token khác. */
export function moTaPhienChat(p: ChatSession): string {
  return `ChatSession(${p.chatSessionId}, reused: ${p.reused}, messages: ${p.messages.length})`;
}

/**
 * Giới hạn độ dài câu hỏi, chép đúng `MAX_QUESTION_LENGTH` của backend.
 *
 * Chặn ở app để khách biết ngay khi gõ, thay vì gõ xong 2500 ký tự rồi mới nhận
 * `CHAT_MESSAGE_TOO_LONG`.
 */
export const GIOI_HAN_DO_DAI_CAU_HOI = 2000;

/**
 * Câu hỏi gửi được không.
 *
 * Rỗng hoặc chỉ khoảng trắng thì KHÔNG gửi — backend trả `CHAT_MESSAGE_EMPTY`, và một lượt hỏng
 * vẫn tính vào hạn mức 10 tin/phút.
 */
export function cauHoiGuiDuoc(noiDung: string): boolean {
  const s = noiDung.trim();
  return s.length > 0 && s.length <= GIOI_HAN_DO_DAI_CAU_HOI;
}
