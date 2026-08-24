import {
  GIOI_HAN_DO_DAI_CAU_HOI,
  cauHoiGuiDuoc,
  chatSessionTuJson,
  cuaKhach,
  luotChatTuJson,
  moTaPhienChat,
} from '../chat';

describe('câu hỏi gửi được không', () => {
  it('rỗng hoặc chỉ khoảng trắng thì KHÔNG gửi', () => {
    // Backend trả CHAT_MESSAGE_EMPTY, và một lượt hỏng vẫn tính vào hạn mức 10 tin/phút.
    expect(cauHoiGuiDuoc('')).toBe(false);
    expect(cauHoiGuiDuoc('   ')).toBe(false);
    expect(cauHoiGuiDuoc('\n\t ')).toBe(false);
  });

  it('câu bình thường thì gửi được', () => {
    expect(cauHoiGuiDuoc('Món nào ít cay?')).toBe(true);
  });

  it('đúng 2000 ký tự vẫn gửi được, 2001 thì không', () => {
    // Chặn ở app để khách biết ngay khi gõ, thay vì gõ xong rồi mới nhận CHAT_MESSAGE_TOO_LONG.
    expect(cauHoiGuiDuoc('a'.repeat(GIOI_HAN_DO_DAI_CAU_HOI))).toBe(true);
    expect(cauHoiGuiDuoc('a'.repeat(GIOI_HAN_DO_DAI_CAU_HOI + 1))).toBe(false);
  });

  it('đếm độ dài SAU khi cắt khoảng trắng', () => {
    expect(cauHoiGuiDuoc(`  ${'a'.repeat(GIOI_HAN_DO_DAI_CAU_HOI)}  `)).toBe(true);
  });
});

describe('phiên chat', () => {
  it('reused = true nghĩa là lịch sử đã có sẵn', () => {
    // Xoá màn hình rồi chào lại từ đầu ở đây là cắt ngang cuộc trò chuyện của chính khách.
    const p = chatSessionTuJson({
      chatSessionId: 'cs_1',
      accessToken: 'ctok',
      reused: true,
      messages: [{ id: 'm1', role: 'user', content: 'Món nào ít cay?' }],
    });

    expect(p.reused).toBe(true);
    expect(p.messages).toHaveLength(1);
    expect(cuaKhach(p.messages[0]!)).toBe(true);
  });

  it('phiên mới thì reused = false và chưa có tin nào', () => {
    const p = chatSessionTuJson({ chatSessionId: 'cs_1', accessToken: 'ctok' });

    expect(p.reused).toBe(false);
    expect(p.messages).toEqual([]);
  });

  it('mô tả phiên KHÔNG chứa accessToken', () => {
    const p = chatSessionTuJson({ chatSessionId: 'cs_1', accessToken: 'ctok_bi_mat' });

    expect(moTaPhienChat(p)).not.toContain('ctok_bi_mat');
    expect(moTaPhienChat(p)).toContain('cs_1');
  });
});

describe('một lượt hỏi đáp', () => {
  it('dùng tin nhắn khách do BACKEND trả, không phải bản app tự dựng', () => {
    // Id và thời điểm do máy chủ quyết định. Bản Java trước đây trả một trường `content` duy
    // nhất khiến cả hai phía đều undefined và hội thoại vỡ ngay lượt đầu.
    const l = luotChatTuJson({
      userMessage: { id: 'u1', role: 'user', content: 'Món nào ít cay?' },
      message: { id: 'a1', role: 'assistant', content: 'Gỏi cuốn nhé.' },
    });

    expect(l.tinKhach.id).toBe('u1');
    expect(l.tinKhach.content).toBe('Món nào ít cay?');
    expect(l.traLoi.content).toBe('Gỏi cuốn nhé.');
  });

  it('đọc gợi ý thêm món kèm LÝ DO', () => {
    // Hiện lý do để khách tự đánh giá thay vì tin thẳng lời một mô hình ngôn ngữ.
    const l = luotChatTuJson({
      userMessage: { id: 'u1', role: 'user', content: 'x' },
      message: { id: 'a1', role: 'assistant', content: 'y' },
      suggestedCartActions: [
        { menuItemId: 'm1', name: 'Gỏi cuốn', price: 55000, quantity: 2, reason: 'Món ít cay' },
      ],
    });

    expect(l.goiY[0]!.name).toBe('Gỏi cuốn');
    expect(l.goiY[0]!.quantity).toBe(2);
    expect(l.goiY[0]!.reason).toBe('Món ít cay');
  });

  it('thiếu suggestStaffHandoff thì mặc định false, không phải undefined', () => {
    const l = luotChatTuJson({
      userMessage: { id: 'u1', role: 'user', content: 'x' },
      message: { id: 'a1', role: 'assistant', content: 'y' },
    });

    expect(l.canGoiNhanVien).toBe(false);
    expect(l.goiY).toEqual([]);
    expect(l.guardrailFlags).toEqual([]);
  });

  it('AI tự nhận nên chuyển cho người thật', () => {
    const l = luotChatTuJson({
      userMessage: { id: 'u1', role: 'user', content: 'x' },
      message: { id: 'a1', role: 'assistant', content: 'y' },
      suggestStaffHandoff: true,
      guardrailFlags: ['ALLERGY_QUESTION'],
    });

    expect(l.canGoiNhanVien).toBe(true);
    expect(l.guardrailFlags).toContain('ALLERGY_QUESTION');
  });
});
