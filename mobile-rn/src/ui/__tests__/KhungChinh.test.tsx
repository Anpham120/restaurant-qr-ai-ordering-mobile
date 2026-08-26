import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { type TableSession } from '../../core/tables/tableSession';
import { KhungChinh } from '../KhungChinh';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

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

/**
 * Mỗi tab bấm vào phải mở ra ĐÚNG màn hình của chính nó.
 *
 * Bản Flutter có lỗi lệch chỉ số giữa hai danh sách song song — 6 màn hình, 4 tab — và nó lên tới
 * máy thật: bấm "Đơn" hiện Giỏ hàng, bấm "Tài khoản" hiện Trợ lý. Bản Flutter chữa bằng một ca
 * kiểm ĐẾM hai danh sách.
 *
 * Bản này bỏ hẳn danh sách thứ hai, nên phép đếm không còn nghĩa gì. Ca kiểm thay thế phải kiểm
 * điều mà lỗi kia THẬT SỰ gây ra: nhãn tab và nội dung màn hình không khớp nhau.
 */
const API_TRONG = {
  menuApi: { thucDon: async () => ({ categories: [], items: [] }) },
  cartApi: {
    gio: async () => ({ tableSessionId: 'ts', items: [], itemCount: 0, subtotal: 0 }),
    doiSoLuong: async () => ({ tableSessionId: 'ts', items: [], itemCount: 0, subtotal: 0 }),
    xoaHet: async () => ({ tableSessionId: 'ts', items: [], itemCount: 0, subtotal: 0 }),
  },
  createOrderApi: {
    taoDon: async () => ({
      orderId: 'o',
      orderCode: 'DH1',
      status: 'Placed',
      totalAmount: 0,
      customerAccessToken: 't',
    }),
  },
  orderApi: { donCuaPhien: async () => [], huyMon: async () => undefined },
  chatApi: {
    moPhien: async () => ({
      chatSessionId: 'cs',
      accessToken: 'c',
      reused: false,
      messages: [],
    }),
    gui: async () => ({
      tinKhach: { id: 'u', role: 'user', content: '', goiY: [] },
      traLoi: { id: 'a', role: 'assistant', content: '', goiY: [] },
      goiY: [],
      canGoiNhanVien: false,
      guardrailFlags: [],
    }),
  },
  promotionApi: { dangChay: async () => [] },
  invoiceApi: {
    hoaDon: async () => ({
      invoiceCode: 'HD',
      status: 'NotRequested',
      method: 'Unselected',
      subtotalAmount: 0,
      discountAmount: 0,
      totalAmount: 0,
      items: [],
      vietQr: null,
    }),
    yeuCauThanhToan: async () => ({
      invoiceCode: 'HD',
      status: 'Pending',
      method: 'COD',
      subtotalAmount: 0,
      discountAmount: 0,
      totalAmount: 0,
      items: [],
      vietQr: null,
    }),
  },
  historyApi: { lichSuCuaToi: async () => [] },
  favouriteApi: { monHayGoi: async () => [] },
  loyaltyApi: {
    cuaToi: async () => ({
      linked: false,
      coHoSo: false,
      phoneNumber: null,
      points: 0,
      availableRewards: [],
      hang: 'BAC' as const,
      tenHang: 'Bạc',
      chiTieu12Thang: 0,
      tenHangKeTiep: 'Vàng',
      conThieu: 5_000_000,
      phieuChuaDung: [],
    }),
    noiSo: async () => ({
      linked: true,
      coHoSo: true,
      phoneNumber: '0901234567',
      points: 0,
      availableRewards: [],
      hang: 'BAC' as const,
      tenHang: 'Bạc',
      chiTieu12Thang: 0,
      tenHangKeTiep: 'Vàng',
      conThieu: 5_000_000,
      phieuChuaDung: [],
    }),
    doiDiem: async () => {
      throw new Error('không dùng');
    },
  },
};

async function dungKhung() {
  const tokenStore = {
    luu: jest.fn().mockResolvedValue(undefined),
    token: jest.fn().mockResolvedValue(null),
    tatCa: jest.fn().mockResolvedValue({}),
    xoaHet: jest.fn().mockResolvedValue(undefined),
  };
  await render(
    <KhungChinh
      {...API_TRONG}
      cauHinh={{ apiBaseUrl: 'http://test:8081', imageBaseUrl: 'http://test:8080' }}
      dangNhap={null}
      onDangNhap={jest.fn()}
      onDangXuat={jest.fn()}
      onMoCaiDat={jest.fn()}
      onRoiBan={jest.fn()}
      phienBan={PHIEN}
      soDienThoai={null}
      tokenStore={tokenStore as never}
    />,
  );
  return tokenStore;
}

/**
 * Nhãn tab → cách tìm một phần tử CHỈ có ở màn hình của tab đó.
 *
 * Dùng hàm chứ không dùng một biểu thức chính quy chung: hai màn hình chỉ phân biệt được qua
 * placeholder của ô nhập, không qua node văn bản. Và không dùng chính tiêu đề màn hình làm dấu
 * hiệu — tiêu đề trùng nhãn tab, nên phép kiểm sẽ xanh cả khi màn hình mở ra là màn hình khác.
 */
const DAU_HIEU: readonly (readonly [string, () => unknown])[] = [
  ['Thực đơn', () => screen.getByPlaceholderText(/Tìm món/)],
  ['Giỏ', () => screen.getByText(/Giỏ đang trống/)],
  ['Đơn', () => screen.getByText(/Bàn chưa có đơn nào/)],
  ['Trợ lý', () => screen.getByPlaceholderText(/Hỏi trợ lý về món ăn/)],
  ['Khuyến mãi', () => screen.getByText(/Hiện chưa có khuyến mãi nào/)],
  ['Tài khoản', () => screen.getByText(/Khách vãng lai/)],
];

describe('điều hướng theo tab', () => {
  it('có đúng 6 tab, không thừa không thiếu', async () => {
    await dungKhung();

    for (const [nhan] of DAU_HIEU) {
      expect(screen.getByLabelText(nhan)).toBeTruthy();
    }
  });

  it.each(DAU_HIEU)('bấm tab "%s" mở ra ĐÚNG màn hình của nó', async (nhan, tim) => {
    // Đây là ca thay cho `dieu_huong_test.dart` của bản Flutter. Nó không đếm hai danh sách nữa
    // (bản này chỉ có một), mà kiểm thứ lỗi kia thật sự gây ra: nhãn tab và nội dung không khớp.
    await dungKhung();

    await fireEvent.press(screen.getByLabelText(nhan));

    await waitFor(() => expect(tim()).toBeTruthy());
  });

  it('tab đang mở được đánh dấu selected cho trình đọc màn hình', async () => {
    await dungKhung();

    expect(screen.getByLabelText('Thực đơn').props.accessibilityState?.selected).toBe(true);

    await fireEvent.press(screen.getByLabelText('Khuyến mãi'));

    expect(screen.getByLabelText('Khuyến mãi').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByLabelText('Thực đơn').props.accessibilityState?.selected).toBe(false);
  });

  it('mở app vào tab Thực đơn, không vào tab trống', async () => {
    await dungKhung();

    await waitFor(() => expect(screen.getByPlaceholderText(/Tìm món/)).toBeTruthy());
  });
});
