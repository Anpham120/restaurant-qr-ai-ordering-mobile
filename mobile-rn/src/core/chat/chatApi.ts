import { AuthException } from '../auth/authApi';
import { HEADER_JSON, type GoiMang, goiMangThat, loiChungHttp, maLoi } from '../mang/goiMang';
import { type ChatSession, type LuotChat, chatSessionTuJson, luotChatTuJson } from './chat';

export interface ChatApi {
  moPhien(tableSessionId: string, tableCode: string): Promise<ChatSession>;
  gui(chatSessionId: string, chatToken: string, noiDung: string): Promise<LuotChat>;
}

/**
 * Thời gian chờ tối đa cho một lượt hỏi đáp.
 *
 * Đo trên hệ thống đang chạy: một câu trả lời mất **9,8 giây**. Đặt ngắn (5–10s) sẽ giết đúng
 * những câu trả lời hợp lệ; không đặt gì thì `fetch` của React Native treo cho tới khi TCP tự bỏ
 * cuộc và khách ngồi nhìn vòng quay mãi. 60 giây là chỗ ở giữa: rộng gấp sáu lần lần đo được,
 * nhưng vẫn kết thúc.
 */
const CHO_HOI_DAP_MS = 60_000;

/** Các lời gọi khác không đợi mô hình ngôn ngữ nên không cần rộng như vậy. */
const CHO_THUONG_MS = 15_000;

export class HttpChatApi implements ChatApi {
  constructor(
    private readonly baseUrl: string,
    private readonly goiMang: GoiMang = goiMangThat,
  ) {}

  async moPhien(tableSessionId: string, tableCode: string): Promise<ChatSession> {
    return chatSessionTuJson(
      await this.goi(
        `${this.baseUrl}/api/chat/sessions`,
        {
          method: 'POST',
          headers: { ...HEADER_JSON },
          body: JSON.stringify({ tableSessionId, tableCode }),
        },
        CHO_THUONG_MS,
      ),
    );
  }

  async gui(chatSessionId: string, chatToken: string, noiDung: string): Promise<LuotChat> {
    return luotChatTuJson(
      await this.goi(
        `${this.baseUrl}/api/chat/sessions/${encodeURIComponent(chatSessionId)}/messages`,
        {
          method: 'POST',
          headers: {
            // `charset=utf-8` là bắt buộc chứ không phải cho đẹp: thiếu nó, một câu hỏi tiếng
            // Việt có dấu bị đọc sai byte và backend trả 400 "Invalid UTF-8 middle byte" — đã
            // gặp thật khi đo bằng curl.
            ...HEADER_JSON,
            'X-Chat-Session-Token': chatToken,
          },
          body: JSON.stringify({ content: noiDung.trim() }),
        },
        CHO_HOI_DAP_MS,
      ),
    );
  }

  private async goi(url: string, init: RequestInit, choMs: number): Promise<unknown> {
    // `fetch` của React Native không có tuỳ chọn hết giờ, khác `package:http` của Dart. Thiếu
    // AbortController thì một dịch vụ AI chết sẽ treo màn hình cho tới khi TCP bỏ cuộc.
    const dungLai = new AbortController();
    const hen = setTimeout(() => dungLai.abort(), choMs);
    let res: Awaited<ReturnType<GoiMang>>;
    try {
      res = await this.goiMang(url, { ...init, signal: dungLai.signal });
    } catch {
      throw new AuthException(
        'NETWORK_ERROR',
        'Không kết nối được trợ lý. Kiểm tra mạng rồi thử lại.',
      );
    } finally {
      clearTimeout(hen);
    }
    const than = await res.text();
    if (res.status === 200) return JSON.parse(than);
    throw dichLoi(res.status, than);
  }
}

function dichLoi(status: number, than: string): AuthException {
  const code = maLoi(than);
  switch (code) {
    case 'CHAT_RATE_LIMITED':
      // 10 tin/phút, 100 tin/phiên. Nói rõ là "chờ một chút" chứ không phải "lỗi" — khách không
      // làm gì sai, chỉ hỏi nhanh quá.
      return new AuthException(
        'CHAT_RATE_LIMITED',
        'Bạn hỏi hơi nhanh. Chờ một chút rồi hỏi tiếp nhé.',
      );
    case 'CHAT_MESSAGE_TOO_LONG':
      return new AuthException('CHAT_MESSAGE_TOO_LONG', 'Câu hỏi dài quá. Rút ngắn lại giúp nhé.');
    case 'CHAT_MESSAGE_EMPTY':
    case 'CHAT_MESSAGE_REQUIRED':
      return new AuthException('CHAT_MESSAGE_EMPTY', 'Chưa nhập câu hỏi.');
    case 'AI_PROVIDER_UNAVAILABLE':
      // Trợ lý chết KHÔNG phải app chết. Chỉ ra lối đi tiếp có thật: xem thực đơn, gọi nhân viên.
      return new AuthException(
        'AI_PROVIDER_UNAVAILABLE',
        'Trợ lý đang bận. Bạn xem thực đơn hoặc gọi nhân viên giúp nhé.',
      );
    case 'CHAT_SESSION_CLOSED':
      return new AuthException(
        'CHAT_SESSION_CLOSED',
        'Cuộc trò chuyện đã đóng. Mở lại từ tab Trợ lý nhé.',
      );
    case 'CHAT_SESSION_TOKEN_INVALID':
    case 'CHAT_SESSION_NOT_FOUND':
      return new AuthException(
        'CHAT_SESSION_NOT_FOUND',
        'Không mở được cuộc trò chuyện này. Quay lại rồi thử lại nhé.',
      );
    case 'CHAT_TABLE_MISMATCH':
      return new AuthException('CHAT_TABLE_MISMATCH', 'Cuộc trò chuyện thuộc bàn khác.');
  }

  const chung = loiChungHttp(status, code, 'Không gửi được câu hỏi');
  return new AuthException(chung.code, chung.message);
}
