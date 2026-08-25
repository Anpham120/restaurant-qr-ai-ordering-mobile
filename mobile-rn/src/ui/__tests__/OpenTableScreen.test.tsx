import { fireEvent, render, screen } from '@testing-library/react-native';

import { type AuthApi, AuthException } from '../../core/auth/authApi';
import { AuthRepository } from '../../core/auth/authRepository';
import { type AuthSession } from '../../core/auth/authSession';
import { type TokenStore } from '../../core/auth/tokenStore';
import { type TableSession } from '../../core/tables/tableSession';
import { type MoPhienTuyChon, type TableSessionApi } from '../../core/tables/tableSessionApi';
import { TableSessionRepository } from '../../core/tables/tableSessionRepository';
import { type TableSessionStore } from '../../core/tables/tableSessionStore';
import { OpenTableScreen } from '../OpenTableScreen';

let mockBanKhung: ((e: { data: string }) => void) | null = null;
const mockQuyen = { granted: true, canAskAgain: true };

jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [mockQuyen, jest.fn()],
  CameraView: (props: { onBarcodeScanned?: (e: { data: string }) => void }) => {
    mockBanKhung = props.onBarcodeScanned ?? null;
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>camera</Text>;
  },
}));

const PHIEN: TableSession = {
  sessionId: 'ts_abc',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  status: 'Open',
  expiresAt: '2030-01-01T00:00:00.000Z',
  isExpired: false,
  tableSessionToken: 'tst',
  resumeState: 'FreshStart',
  qrToken: 'cmc-table-t01-qr',
};

const NGUOI: AuthSession = {
  accessToken: 'jwt',
  expiresAt: '2030-01-01T00:00:00.000Z',
  user: { userId: 'u1', fullName: 'A', email: 'a@example.com', role: 'Customer' },
};

class StoreTrong implements TableSessionStore {
  private dang: TableSession | null = null;
  async doc() {
    return this.dang;
  }
  async luu(s: TableSession) {
    this.dang = s;
  }
  async xoa() {
    this.dang = null;
  }
}

class AuthStoreTrong implements TokenStore {
  async doc() {
    return null;
  }
  async luu() {}
  async xoa() {}
}

const authApi: AuthApi = {
  dangNhap: async () => {
    throw new Error('không dùng');
  },
  dangKy: async () => {
    throw new Error('không dùng');
  },
};

function repoVoi(api: TableSessionApi) {
  return new TableSessionRepository(
    api,
    new StoreTrong(),
    new AuthRepository(authApi, new AuthStoreTrong()),
  );
}

class ApiTot implements TableSessionApi {
  qrDaNhan: string | null = null;
  async moPhien(qrToken: string, _t?: MoPhienTuyChon) {
    this.qrDaNhan = qrToken;
    return PHIEN;
  }
}

beforeEach(() => {
  mockBanKhung = null;
});

describe('vào bàn bằng cách nhập tay', () => {
  it('gõ mã rồi bấm Vào bàn thì mở phiên và báo ra ngoài', async () => {
    const api = new ApiTot();
    const xong = jest.fn();
    await render(<OpenTableScreen onMoPhienXong={xong} repository={repoVoi(api)} />);

    await fireEvent.changeText(screen.getByLabelText('Mã QR của bàn'), 'cmc-table-t01-qr');
    await fireEvent.press(screen.getByLabelText('Vào bàn'));

    expect(api.qrDaNhan).toBe('cmc-table-t01-qr');
    expect(xong).toHaveBeenCalledWith(expect.objectContaining({ tableCode: 'T01' }));
  });

  it('mã sai thì hiện câu tiếng Việt và KHÔNG vào bàn', async () => {
    const xong = jest.fn();
    const api: TableSessionApi = {
      moPhien: async () => {
        throw new AuthException('QR_NOT_FOUND', 'Mã QR không đúng hoặc bàn đã ngừng phục vụ.');
      },
    };
    await render(<OpenTableScreen onMoPhienXong={xong} repository={repoVoi(api)} />);

    await fireEvent.changeText(screen.getByLabelText('Mã QR của bàn'), 'sai');
    await fireEvent.press(screen.getByLabelText('Vào bàn'));

    await screen.findByText('Mã QR không đúng hoặc bàn đã ngừng phục vụ.');
    expect(xong).not.toHaveBeenCalled();
  });
});

describe('quét bằng camera', () => {
  it('quét xong thì ĐIỀN mã vào ô nhập tay rồi mới mở phiên', async () => {
    // Điền trước là có chủ đích: nếu mở phiên hỏng, khách thấy ngay thứ vừa quét được và sửa
    // được — thay vì một câu báo lỗi trên một ô trống.
    const api = new ApiTot();
    await render(<OpenTableScreen onMoPhienXong={jest.fn()} repository={repoVoi(api)} />);

    await fireEvent.press(screen.getByText('Quét mã QR trên bàn'));
    await screen.findByText('camera');
    mockBanKhung?.({ data: 'https://o.example.com/table/T01?qr=cmc-table-t01-qr' });

    const o = await screen.findByLabelText('Mã QR của bàn');
    expect(o.props.value).toBe('cmc-table-t01-qr');
    expect(api.qrDaNhan).toBe('cmc-table-t01-qr');
  });

  it('quét hỏng thì ô nhập tay VẪN giữ mã để khách thử lại', async () => {
    const api: TableSessionApi = {
      moPhien: async () => {
        throw new AuthException('QR_NOT_FOUND', 'Bàn đã ngừng phục vụ.');
      },
    };
    await render(<OpenTableScreen onMoPhienXong={jest.fn()} repository={repoVoi(api)} />);

    await fireEvent.press(screen.getByText('Quét mã QR trên bàn'));
    await screen.findByText('camera');
    mockBanKhung?.({ data: 'cmc-table-t01-qr' });

    await screen.findByText('Bàn đã ngừng phục vụ.');
    expect(screen.getByLabelText('Mã QR của bàn').props.value).toBe('cmc-table-t01-qr');
  });

  it('huỷ quét thì quay lại màn nhập tay, không kẹt ở camera', async () => {
    await render(<OpenTableScreen onMoPhienXong={jest.fn()} repository={repoVoi(new ApiTot())} />);

    await fireEvent.press(screen.getByText('Quét mã QR trên bàn'));
    await screen.findByText('camera');
    await fireEvent.press(screen.getByText('Nhập mã bằng tay'));

    expect(screen.getByLabelText('Vào bàn')).toBeTruthy();
  });
});

describe('nói rõ đơn có được gắn tài khoản không', () => {
  it('chưa đăng nhập thì nói là khách vãng lai', async () => {
    await render(<OpenTableScreen onMoPhienXong={jest.fn()} repository={repoVoi(new ApiTot())} />);

    expect(screen.getByText('Đang vào với tư cách khách vãng lai')).toBeTruthy();
  });

  it('đã đăng nhập thì nói rõ sẽ cộng vào tài khoản nào', async () => {
    // Đây là điểm duy nhất khách còn kịp quyết định. Biết sau khi đã gọi món thì không sửa được
    // nữa: phiên bàn dùng chung và người gắn trước giữ liên kết.
    await render(
      <OpenTableScreen
        dangNhapVoi={NGUOI}
        onMoPhienXong={jest.fn()}
        repository={repoVoi(new ApiTot())}
      />,
    );

    expect(screen.getByText('Đơn của bàn này sẽ được cộng vào tài khoản của bạn')).toBeTruthy();
    expect(screen.getByText('a@example.com')).toBeTruthy();
  });
});
