import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type Invoice } from '../../core/payment/invoice';
import { type InvoiceApi } from '../../core/payment/invoiceApi';
import { type TableSession } from '../../core/tables/tableSession';
import { type Promotion } from '../../core/promotions/promotion';
import { type PromotionApi } from '../../core/promotions/promotionApi';
import { PaymentScreen } from '../PaymentScreen';

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

function hoaDon(tuyChon: Partial<Invoice> = {}): Invoice {
  return {
    invoiceCode: 'HD1',
    status: 'NotRequested',
    method: 'Unselected',
    subtotalAmount: 130000,
    discountAmount: 10000,
    totalAmount: 120000,
    // Dòng món 130.000, giảm 10.000, còn 120.000. Để dòng món KHÁC tổng là có chủ ý: bằng nhau
    // thì một phép kiểm "hiện đúng tổng" sẽ xanh cả khi màn hình vẽ nhầm dòng món thành tổng.
    items: [{ name: 'Phở bò tái', quantity: 2, lineTotal: 130000 }],
    vietQr: null,
    ...tuyChon,
  };
}

function apiVoi(hd: Invoice, yeuCau?: InvoiceApi['yeuCauThanhToan']): InvoiceApi {
  return {
    hoaDon: async () => hd,
    yeuCauThanhToan: yeuCau ?? (async () => hd),
  };
}

describe('hiện hoá đơn', () => {
  it('hiện từng dòng món, giảm giá và tổng', async () => {
    await render(<PaymentScreen api={apiVoi(hoaDon())} phienBan={PHIEN} />);

    await screen.findByText('2 x Phở bò tái');
    expect(screen.getByText('-10.000đ')).toBeTruthy();
    expect(screen.getByText('120.000đ')).toBeTruthy();
    expect(screen.getByText('Chưa yêu cầu thanh toán')).toBeTruthy();
  });

  it('KHÔNG hiện dòng giảm giá khi bằng 0', async () => {
    await render(<PaymentScreen api={apiVoi(hoaDon({ discountAmount: 0 }))} phienBan={PHIEN} />);

    await screen.findByText('2 x Phở bò tái');
    expect(screen.queryByText('Giảm giá')).toBeNull();
  });

  it('bàn chưa có món thì nói rõ, không hiện nút thanh toán', async () => {
    await render(<PaymentScreen api={apiVoi(hoaDon({ items: [] }))} phienBan={PHIEN} />);

    await screen.findByText('Bàn chưa có món nào để thanh toán.');
    expect(screen.queryByText('Trả tiền mặt tại quầy')).toBeNull();
  });

  it('KHÔNG có nút "Tôi đã trả" ở bất kỳ trạng thái nào', async () => {
    // Khách không có quyền xác nhận: POST .../payment/confirm bằng token bàn trả 401. Một nút
    // không làm gì sẽ khiến khách bấm rồi tưởng đã xong và bỏ đi.
    await render(
      <PaymentScreen api={apiVoi(hoaDon({ status: 'Pending', method: 'COD' }))} phienBan={PHIEN} />,
    );

    await screen.findByText(/Mời bạn trả tiền mặt/);
    expect(screen.queryByText(/Tôi đã trả/)).toBeNull();
    expect(screen.queryByText(/Xác nhận/)).toBeNull();
  });
});

describe('yêu cầu thanh toán', () => {
  it('nói TRƯỚC rằng sau khi yêu cầu chỉ bớt được món, không thêm được', async () => {
    // Đo thật: thêm món trả TABLE_INVOICE_PAYMENT_PENDING, nhưng BỚT món vẫn được. Nói "khoá
    // giỏ" là làm mất đúng thông tin đó.
    await render(<PaymentScreen api={apiVoi(hoaDon())} phienBan={PHIEN} />);

    const s = await screen.findByText(/Sau khi yêu cầu/);
    expect(s.props.children).toContain('vẫn bớt được');
  });

  it('bấm COD gửi đúng phương thức', async () => {
    const yeuCau = jest.fn().mockResolvedValue(hoaDon({ status: 'Pending', method: 'COD' }));
    await render(<PaymentScreen api={apiVoi(hoaDon(), yeuCau)} phienBan={PHIEN} />);

    await fireEvent.press(await screen.findByText('Trả tiền mặt tại quầy'));

    expect(yeuCau).toHaveBeenCalledWith(
      'ts_abc',
      'tst',
      'COD',
      expect.any(String),
      null,
      // Hai mã để trống khi khách không nhập gì — nhưng vẫn được TRUYỀN, vì trước đây màn này
      // không gửi mã nào cả và khách không có cách nào áp ưu đãi lúc thanh toán.
      '',
      '',
    );
    await screen.findByText(/Mời bạn trả tiền mặt/);
  });

  it('đổi phương thức thì đổi khoá idempotency', async () => {
    // Gửi lại CÙNG cách trả tiền là cùng một yêu cầu; đổi từ COD sang VietQR là yêu cầu KHÁC và
    // phải có khoá khác, nếu không backend trả 409 IDEMPOTENCY_KEY_REUSED.
    const khoa: string[] = [];
    const yeuCau = jest.fn(async (_s: string, _t: string, _m: string, k: string) => {
      khoa.push(k);
      throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
    });
    await render(<PaymentScreen api={apiVoi(hoaDon(), yeuCau)} phienBan={PHIEN} />);

    await fireEvent.press(await screen.findByText('Trả tiền mặt tại quầy'));
    await fireEvent.press(screen.getByText('Chuyển khoản VietQR'));
    await fireEvent.press(screen.getByText('Trả tiền mặt tại quầy'));

    expect(khoa[0]).not.toBe(khoa[1]);
  });

  it('chưa cấu hình ngân hàng thì chỉ ra lối thoát có thật', async () => {
    const yeuCau = jest
      .fn()
      .mockRejectedValue(
        new AuthException(
          'VIETQR_CONFIG_MISSING',
          'Chuyển khoản đang tạm ngưng. Chọn trả tiền mặt tại quầy giúp nhé.',
        ),
      );
    await render(<PaymentScreen api={apiVoi(hoaDon(), yeuCau)} phienBan={PHIEN} />);

    await fireEvent.press(await screen.findByText('Chuyển khoản VietQR'));

    const loi = await screen.findByText(/Chuyển khoản đang tạm ngưng/);
    expect(loi.props.children).toContain('tiền mặt');
    // Nút COD vẫn còn đó để khách đi tiếp ngay.
    expect(screen.getByText('Trả tiền mặt tại quầy')).toBeTruthy();
  });
});

describe('chờ chuyển khoản VietQR', () => {
  const hdQr = hoaDon({
    status: 'Pending',
    method: 'VietQR',
    vietQr: {
      amount: 120000,
      transferContent: 'VIAN TS0042',
      quickLink: null,
      qrImageDataUri: 'data:image/png;base64,iVBORw0KGgo=',
    },
  });

  it('hiện nội dung chuyển khoản và NHẤN MẠNH giữ nguyên', async () => {
    await render(<PaymentScreen api={apiVoi(hdQr)} phienBan={PHIEN} />);

    await screen.findByText('VIAN TS0042');
    expect(screen.getByText(/GIỮ NGUYÊN/)).toBeTruthy();
  });

  it('chép nội dung chứ KHÔNG cho sửa', async () => {
    // Hệ thống đối soát bằng đúng chuỗi này (#3). Một ô nhập ở đây là mời khách sửa, và sửa một
    // ký tự là tiền về mà không ai nhận ra.
    const chep = jest.fn().mockResolvedValue(undefined);
    const baoTin = jest.fn();
    await render(
      <PaymentScreen api={apiVoi(hdQr)} chepVaoBoNho={chep} onBaoTin={baoTin} phienBan={PHIEN} />,
    );

    await fireEvent.press(await screen.findByLabelText('Chép nội dung chuyển khoản'));

    expect(chep).toHaveBeenCalledWith('VIAN TS0042');
    expect(baoTin).toHaveBeenCalledWith('Đã chép nội dung');
  });

  it('ảnh QR hỏng KHÔNG che mất nội dung chuyển khoản', async () => {
    // Khách vẫn chuyển tay được nếu còn đọc được nội dung. Đặt phần nội dung trong nhánh "có ảnh"
    // là biến một ảnh hỏng thành một màn hình vô dụng.
    await render(<PaymentScreen api={apiVoi(hdQr)} phienBan={PHIEN} />);
    const anh = await screen.findByLabelText('Mã QR chuyển khoản');

    await fireEvent(anh, 'error');

    expect(screen.getByText('VIAN TS0042')).toBeTruthy();
    // Kiểm theo NHÃN chứ không theo con số: "120.000đ" xuất hiện hai lần đúng theo thiết kế —
    // tổng hoá đơn và số tiền chuyển khoản. Tìm theo số sẽ đỏ vì trùng, không vì sai.
    expect(screen.getByText('Số tiền')).toBeTruthy();
  });

  it('KHÔNG có ảnh QR thì vẫn hiện nội dung để chuyển tay', async () => {
    const khongAnh = hoaDon({
      status: 'Pending',
      method: 'VietQR',
      vietQr: {
        amount: 120000,
        transferContent: 'VIAN TS0042',
        quickLink: null,
        qrImageDataUri: null,
      },
    });
    await render(<PaymentScreen api={apiVoi(khongAnh)} phienBan={PHIEN} />);

    await screen.findByText('VIAN TS0042');
    expect(screen.queryByLabelText('Mã QR chuyển khoản')).toBeNull();
  });

  it('có nút kiểm tra lại trạng thái, vì hệ thống tự nhận chứ khách không xác nhận', async () => {
    let soLanDoc = 0;
    const api: InvoiceApi = {
      hoaDon: async () => {
        soLanDoc++;
        return soLanDoc === 1 ? hdQr : hoaDon({ status: 'Paid', method: 'VietQR' });
      },
      yeuCauThanhToan: async () => hdQr,
    };
    await render(<PaymentScreen api={api} phienBan={PHIEN} />);

    await fireEvent.press(await screen.findByText('Kiểm tra lại trạng thái'));

    await screen.findByText('Cảm ơn bạn. Hẹn gặp lại!');
  });
});

describe('mã ưu đãi lúc thanh toán', () => {
  const KM: PromotionApi = {
    dangChay: async () => [
      { code: 'GIAM10', name: 'Giảm 10%', description: null } as unknown as Promotion,
    ],
  };

  it('gõ cả hai mã thì CẢ HAI được gửi lên', async () => {
    // Trước đây màn này không gửi mã nào cả: khách không có cách nào áp ưu đãi lúc thanh toán,
    // dù web có ô nhập và backend nhận cả hai.
    const goi = jest.fn(async () => hoaDon());
    await render(<PaymentScreen api={apiVoi(hoaDon(), goi)} phienBan={PHIEN} promotionApi={KM} />);

    await fireEvent.changeText(await screen.findByLabelText('Mã ưu đãi của quán'), 'giam10');
    await fireEvent.changeText(screen.getByLabelText('Mã đổi bằng điểm'), 'a7k2-m9x3');
    await fireEvent.press(screen.getByText('Trả tiền mặt tại quầy'));

    expect(goi).toHaveBeenCalledWith(
      'ts_abc',
      'tst',
      'COD',
      expect.any(String),
      null,
      'giam10',
      'a7k2-m9x3',
    );
  });

  it('chạm vào mã đang chạy thì ĐIỀN vào ô, không bắt gõ lại', async () => {
    // Bắt gõ lại một mã đang hiện ngay trên màn hình là bắt làm một việc máy làm được.
    await render(<PaymentScreen api={apiVoi(hoaDon())} phienBan={PHIEN} promotionApi={KM} />);

    await fireEvent.press(await screen.findByLabelText('Dùng mã GIAM10'));

    expect(screen.getByLabelText('Mã ưu đãi của quán').props.value).toBe('GIAM10');
  });

  it('không có promotionApi thì màn vẫn chạy, chỉ không có danh sách mã', async () => {
    await render(<PaymentScreen api={apiVoi(hoaDon())} phienBan={PHIEN} />);

    expect(await screen.findByLabelText('Mã ưu đãi của quán')).toBeTruthy();
    expect(screen.queryByLabelText('Dùng mã GIAM10')).toBeNull();
  });
});
