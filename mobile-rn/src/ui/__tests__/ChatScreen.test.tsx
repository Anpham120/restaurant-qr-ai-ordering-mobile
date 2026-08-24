import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type ChatApi } from '../../core/chat/chatApi';
import { type TableSession } from '../../core/tables/tableSession';
import { ChatScreen } from '../ChatScreen';

const PHIEN: TableSession = {
  sessionId: 'ts_abc',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  status: 'Open',
  expiresAt: '2030-01-01T00:00:00.000Z',
  isExpired: false,
  tableSessionToken: 'tst',
  resumeState: 'FreshStart',
  qrToken: 'qr',
};

const GOI_Y = {
  menuItemId: 'm1',
  name: 'Gỏi cuốn tôm thịt',
  price: 55000,
  quantity: 2,
  reason: 'Món ít cay, hợp với yêu cầu của bạn',
};

function apiVoi(ghiDe: Partial<ChatApi> = {}): ChatApi {
  return {
    moPhien: async () => ({
      chatSessionId: 'cs_1',
      accessToken: 'ctok',
      reused: false,
      messages: [],
    }),
    gui: async () => ({
      tinKhach: { id: 'u1', role: 'user', content: 'Món nào ít cay?', goiY: [] },
      traLoi: { id: 'a1', role: 'assistant', content: 'Gỏi cuốn nhé.', goiY: [] },
      goiY: [],
      canGoiNhanVien: false,
      guardrailFlags: [],
    }),
    ...ghiDe,
  };
}

describe('mở phiên trò chuyện', () => {
  it('phiên DÙNG LẠI thì giữ nguyên lịch sử, không chào lại từ đầu', async () => {
    // Khách quay lại giữa cuộc trò chuyện của chính mình. Xoá màn hình ở đây là cắt ngang nó.
    const api = apiVoi({
      moPhien: async () => ({
        chatSessionId: 'cs_1',
        accessToken: 'ctok',
        reused: true,
        messages: [
          { id: 'u0', role: 'user', content: 'Quán có món chay không?', goiY: [] },
          { id: 'a0', role: 'assistant', content: 'Có đậu hũ chiên sả.', goiY: [] },
        ],
      }),
    });
    await render(<ChatScreen api={api} phienBan={PHIEN} />);

    await screen.findByText('Quán có món chay không?');
    expect(screen.getByText('Có đậu hũ chiên sả.')).toBeTruthy();
  });
});

describe('hỏi đáp', () => {
  it('gửi xong thì hiện CẢ câu hỏi lẫn câu trả lời do backend trả', async () => {
    await render(<ChatScreen api={apiVoi()} phienBan={PHIEN} />);

    await fireEvent.changeText(await screen.findByLabelText('Câu hỏi'), 'Món nào ít cay?');
    await fireEvent.press(screen.getByLabelText('Gửi'));

    await screen.findByText('Gỏi cuốn nhé.');
    expect(screen.getByText('Món nào ít cay?')).toBeTruthy();
  });

  it('câu hỏi RỖNG thì nút gửi bị khoá', async () => {
    // Backend trả CHAT_MESSAGE_EMPTY, và một lượt hỏng VẪN tính vào hạn mức 10 tin/phút — tức
    // bấm nhầm làm khách mất lượt hỏi thật.
    await render(<ChatScreen api={apiVoi()} phienBan={PHIEN} />);

    const nut = await screen.findByLabelText('Gửi');
    expect(nut.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Câu hỏi'), '   ');
    expect(screen.getByLabelText('Gửi').props.accessibilityState?.disabled).toBe(true);
  });

  it('hỏi nhanh quá thì hiện câu "chờ một chút", không mất câu đang gõ', async () => {
    const api = apiVoi({
      gui: async () => {
        throw new AuthException(
          'CHAT_RATE_LIMITED',
          'Bạn hỏi hơi nhanh. Chờ một chút rồi hỏi tiếp nhé.',
        );
      },
    });
    await render(<ChatScreen api={api} phienBan={PHIEN} />);

    await fireEvent.changeText(await screen.findByLabelText('Câu hỏi'), 'Món nào ít cay?');
    await fireEvent.press(screen.getByLabelText('Gửi'));

    await screen.findByText(/Chờ một chút/);
    // Gõ lại cả câu là hình phạt cho một lỗi khách không gây ra.
    expect(screen.getByLabelText('Câu hỏi').props.value).toBe('Món nào ít cay?');
  });

  it('trợ lý chết thì chỉ ra lối đi tiếp, app KHÔNG chết theo', async () => {
    const api = apiVoi({
      gui: async () => {
        throw new AuthException(
          'AI_PROVIDER_UNAVAILABLE',
          'Trợ lý đang bận. Bạn xem thực đơn hoặc gọi nhân viên giúp nhé.',
        );
      },
    });
    await render(<ChatScreen api={api} phienBan={PHIEN} />);

    await fireEvent.changeText(await screen.findByLabelText('Câu hỏi'), 'x');
    await fireEvent.press(screen.getByLabelText('Gửi'));

    await screen.findByText(/Trợ lý đang bận/);
    expect(screen.getByLabelText('Câu hỏi')).toBeTruthy();
  });
});

describe('gợi ý thêm món — trợ lý KHÔNG tự thêm', () => {
  const apiCoGoiY = () =>
    apiVoi({
      gui: async () => ({
        tinKhach: { id: 'u1', role: 'user', content: 'Món nào ít cay?', goiY: [] },
        traLoi: { id: 'a1', role: 'assistant', content: 'Thử gỏi cuốn nhé.', goiY: [] },
        goiY: [GOI_Y],
        canGoiNhanVien: false,
        guardrailFlags: [],
      }),
    });

  async function hoiVaNhanGoiY(onThem?: jest.Mock) {
    await render(<ChatScreen api={apiCoGoiY()} onThemVaoGio={onThem} phienBan={PHIEN} />);
    await fireEvent.changeText(await screen.findByLabelText('Câu hỏi'), 'Món nào ít cay?');
    await fireEvent.press(screen.getByLabelText('Gửi'));
    await screen.findByText('Thử gỏi cuốn nhé.');
  }

  it('KHÔNG tự thêm vào giỏ khi nhận gợi ý', async () => {
    // Đây là luật nghiêm nhất của màn này: tự thêm là tiêu tiền của khách theo lời một mô hình
    // ngôn ngữ. Backend chỉ chuyển tiếp gợi ý cần khách xác nhận, và app phải tôn trọng điều đó.
    const them = jest.fn();
    await hoiVaNhanGoiY(them);

    expect(them).not.toHaveBeenCalled();
    expect(screen.getByText('2 x Gỏi cuốn tôm thịt')).toBeTruthy();
  });

  it('nói RÕ trợ lý không tự thêm gì cả', async () => {
    await hoiVaNhanGoiY(jest.fn());

    expect(screen.getByText('Bấm để thêm vào giỏ — trợ lý không tự thêm gì cả.')).toBeTruthy();
  });

  it('hiện LÝ DO để khách tự đánh giá thay vì tin thẳng', async () => {
    await hoiVaNhanGoiY(jest.fn());

    expect(screen.getByText('Món ít cay, hợp với yêu cầu của bạn')).toBeTruthy();
  });

  it('KHÁCH bấm thì mới thêm, và thêm đúng số lượng AI gợi ý', async () => {
    const them = jest.fn().mockResolvedValue(undefined);
    const baoTin = jest.fn();
    await render(
      <ChatScreen api={apiCoGoiY()} onBaoTin={baoTin} onThemVaoGio={them} phienBan={PHIEN} />,
    );
    await fireEvent.changeText(await screen.findByLabelText('Câu hỏi'), 'x');
    await fireEvent.press(screen.getByLabelText('Gửi'));
    await screen.findByText('Thử gỏi cuốn nhé.');

    await fireEvent.press(screen.getByLabelText('Thêm Gỏi cuốn tôm thịt'));

    expect(them).toHaveBeenCalledWith('m1', 2);
    expect(baoTin).toHaveBeenCalledWith('Đã thêm Gỏi cuốn tôm thịt vào giỏ');
  });

  it('chưa vào bàn (không có onThemVaoGio) thì KHÔNG hiện nút thêm', async () => {
    await hoiVaNhanGoiY(undefined);

    expect(screen.queryByLabelText('Thêm Gỏi cuốn tôm thịt')).toBeNull();
  });
});
