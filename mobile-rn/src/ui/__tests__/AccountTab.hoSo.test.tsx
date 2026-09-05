import { fireEvent, render, screen } from '@testing-library/react-native';

import { type AuthSession } from '../../core/auth/authSession';
import { type MyLoyalty } from '../../core/loyalty/loyalty';
import { type LoyaltyApi } from '../../core/loyalty/loyaltyApi';
import { type TableSession } from '../../core/tables/tableSession';
import { AccountTab, type AccountTabProps } from '../AccountTab';

const PHIEN_BAN = {
  sessionId: 'ts_abc',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  status: 'Open',
  expiresAt: '2030-01-01T00:00:00.000Z',
  isExpired: false,
  tableSessionToken: 'tst',
  resumeState: 'FreshStart',
  qrToken: 'qr',
} as unknown as TableSession;

const DANG_NHAP: AuthSession = {
  accessToken: 'jwt',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  user: { userId: 'usr_1', fullName: 'An Phạm', email: 'an@gmail.com', role: 'Customer' },
};

const DA_NOI: MyLoyalty = {
  linked: true,
  coHoSo: true,
  phoneNumber: '0901234567',
  points: 320,
  availableRewards: [],
  hang: 'BAC',
  tenHang: 'Bạc',
  chiTieu12Thang: 0,
  tenHangKeTiep: 'Vàng',
  conThieu: 5_000_000,
  phieuChuaDung: [],
};

function apiVoi(ghiDe: Partial<LoyaltyApi> = {}): LoyaltyApi {
  return {
    cuaToi: async () => DA_NOI,
    noiSo: async () => DA_NOI,
    doiDiem: async () => {
      throw new Error('không dùng tới');
    },
    ...ghiDe,
  };
}

function props(ghiDe: Partial<AccountTabProps> = {}): AccountTabProps {
  return {
    // Bản giả: trả một lượt chờ nhập mã, mã nào cũng ra token. Phần luật của OTP được canh
    // riêng ở `phoneOtp` và `DangKySoDienThoai`; ở đây chỉ cần màn hình dựng được.
    guiMaOtp: async () => ({ xacNhan: async () => 'token-otp' }),
    phienBan: PHIEN_BAN,
    dangNhap: DANG_NHAP,
    cauHinh: { apiBaseUrl: 'http://x', imageBaseUrl: 'http://x' },
    soDienThoai: null,
    invoiceApi: {} as AccountTabProps['invoiceApi'],
    historyApi: { lichSuCuaToi: async () => [] } as unknown as AccountTabProps['historyApi'],
    favouriteApi: { monHayGoi: async () => [] } as unknown as AccountTabProps['favouriteApi'],
    loyaltyApi: apiVoi(),
    promotionApi: {} as AccountTabProps['promotionApi'],
    orderApi: {} as AccountTabProps['orderApi'],
    themVaoGio: async () => {},
    onMoCaiDat: () => {},
    onRoiBan: () => {},
    onDangNhap: () => {},
    onDangXuat: () => {},
    ...ghiDe,
  };
}

const moHoSo = async () => fireEvent.press(await screen.findByLabelText('Hồ sơ tài khoản'));

describe('hồ sơ tài khoản', () => {
  it('chưa liên kết: nói RÕ ở ngay dòng menu, không bắt vào mới biết', async () => {
    // Khách phải thấy mình đang thiếu gì mà không cần bấm thử từng mục.
    await render(<AccountTab {...props({ soDienThoai: null })} />);

    expect(await screen.findByText('Chưa liên kết số điện thoại')).toBeTruthy();
  });

  it('đã liên kết: hiện luôn số ở dòng menu', async () => {
    await render(<AccountTab {...props({ soDienThoai: '0901234567' })} />);

    expect(await screen.findByText('Số điện thoại: 0901234567')).toBeTruthy();
  });

  it('mở hồ sơ khi CHƯA liên kết thì có form liên kết ngay tại đó', async () => {
    // Đây là điều kiện của cả tính năng: liên kết phải làm được TỪ hồ sơ, không phải đi vòng
    // qua mục Điểm thưởng — nơi khách chỉ nghĩ tới khi đã biết mình có điểm.
    await render(<AccountTab {...props({ soDienThoai: null })} />);

    await moHoSo();

    expect(await screen.findByLabelText('Số điện thoại')).toBeTruthy();
    expect(screen.getByLabelText('Gửi mã xác minh')).toBeTruthy();
  });

  it('mở hồ sơ khi ĐÃ liên kết thì KHÔNG hiện form nữa', async () => {
    // Hiện lại form cho người đã liên kết là mời họ làm một việc đã xong, và bấm vào chỉ nhận lỗi.
    await render(<AccountTab {...props({ soDienThoai: '0901234567' })} />);

    await moHoSo();

    expect(screen.queryByLabelText('Gửi mã xác minh')).toBeNull();
  });

  it('nối số xong thì BÁO LÊN trên, không giữ riêng trong màn hồ sơ', async () => {
    // `soDienThoai` còn dùng để điền sẵn ô số lúc thanh toán. Không báo lên thì khách vừa liên
    // kết xong, sang trả tiền vẫn thấy ô trống, và lần đó KHÔNG tích được điểm.
    const baoLen = jest.fn();
    await render(<AccountTab {...props({ soDienThoai: null, onNoiSoXong: baoLen })} />);

    await moHoSo();
    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Gửi mã xác minh'));
    await fireEvent.changeText(await screen.findByLabelText('Mã xác minh'), '123456');
    await fireEvent.press(screen.getByLabelText('Xác minh và liên kết'));

    expect(baoLen).toHaveBeenCalledWith('0901234567');
  });

  it('số ĐÃ CÓ hồ sơ điểm vẫn nối được ngay trong hồ sơ, không phải ra quầy', async () => {
    // Đây là ca phổ biến nhất: khách ăn tại quán qua web, tích điểm theo số, rồi mới tải app.
    //
    // Bản trước từ chối đúng ca này (`LOYALTY_PHONE_ALREADY_MEMBER`) và đưa một mã sáu chữ số để
    // khách đọc cho nhân viên quầy nối hộ. Nghiệp vụ đã đổi: khách tự nối, xác minh bằng OTP —
    // chặt hơn hẳn mã cũ, thứ chỉ chứng minh khách sở hữu TÀI KHOẢN chứ không nói gì về SỐ.
    const baoLen = jest.fn();
    await render(<AccountTab {...props({ soDienThoai: null, onNoiSoXong: baoLen })} />);

    await moHoSo();
    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Gửi mã xác minh'));
    await fireEvent.changeText(await screen.findByLabelText('Mã xác minh'), '123456');
    await fireEvent.press(screen.getByLabelText('Xác minh và liên kết'));

    expect(baoLen).toHaveBeenCalledWith('0901234567');
    // Không còn mã nào để đọc ở quầy, và không còn câu nào chỉ khách ra quầy.
    expect(screen.queryByText(/quầy/)).toBeNull();
  });
});
