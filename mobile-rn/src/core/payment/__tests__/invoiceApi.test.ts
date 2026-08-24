import { type GoiMang } from '../../mang/goiMang';
import { HttpInvoiceApi } from '../invoiceApi';

const HOA_DON_COD = JSON.stringify({
  invoiceCode: 'HD1',
  status: 'Pending',
  method: 'COD',
  subtotalAmount: 130000,
  discountAmount: 10000,
  totalAmount: 120000,
  items: [{ name: 'Phở bò tái', quantity: 2, lineTotal: 120000 }],
  vietQr: null,
});

const loiJson = (code: string) =>
  JSON.stringify({ error: { code, message: 'in English', details: {} } });

function api(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpInvoiceApi('http://test', goi);
}

function daGui(ghiLai: jest.Mock) {
  const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return {
    url,
    headers: (init.headers ?? {}) as Record<string, string>,
    body:
      init.body === undefined ? null : (JSON.parse(init.body as string) as Record<string, unknown>),
  };
}

describe('đọc hoá đơn', () => {
  it('uỷ quyền bằng token bàn, không bằng JWT', async () => {
    const ghiLai = jest.fn();
    await api(200, HOA_DON_COD, ghiLai).hoaDon('ts_abc', 'tst');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/table-sessions/ts_abc/invoice');
    expect(g.headers['X-Table-Session-Token']).toBe('tst');
    expect(g.headers).not.toHaveProperty('Authorization');
  });

  it('phân giải hoá đơn COD, vietQr null', async () => {
    const hd = await api(200, HOA_DON_COD).hoaDon('ts', 'tst');

    expect(hd.invoiceCode).toBe('HD1');
    expect(hd.method).toBe('COD');
    expect(hd.discountAmount).toBe(10000);
    expect(hd.items[0]!.name).toBe('Phở bò tái');
    expect(hd.vietQr).toBeNull();
  });
});

describe('yêu cầu thanh toán', () => {
  it('LUÔN gửi Idempotency-Key và phương thức', async () => {
    const ghiLai = jest.fn();
    await api(201, HOA_DON_COD, ghiLai).yeuCauThanhToan('ts_abc', 'tst', 'COD', 'pay.k1');

    const g = daGui(ghiLai);
    expect(g.url).toBe('http://test/api/table-sessions/ts_abc/invoice/payment-request');
    expect(g.headers['Idempotency-Key']).toBe('pay.k1');
    expect(g.body).toEqual({ method: 'COD' });
  });

  it('gửi số điện thoại khi có — quyết định đơn có tích điểm hay không', async () => {
    const ghiLai = jest.fn();
    await api(201, HOA_DON_COD, ghiLai).yeuCauThanhToan('ts', 'tst', 'COD', 'k', '0901234567');

    expect(daGui(ghiLai).body?.customerPhoneNumber).toBe('0901234567');
  });

  it('KHÔNG gửi khoá số điện thoại khi chưa liên kết', async () => {
    const ghiLai = jest.fn();
    await api(201, HOA_DON_COD, ghiLai).yeuCauThanhToan('ts', 'tst', 'COD', 'k');

    expect(daGui(ghiLai).body).not.toHaveProperty('customerPhoneNumber');
  });

  it('bóc hoá đơn ra khỏi khoá invoice của phản hồi', async () => {
    // POST bọc hoá đơn trong khoá `invoice`, khác với GET trả thẳng. Đọc nhầm sẽ cho ra một hoá
    // đơn toàn giá trị mặc định — trạng thái NotRequested, tổng tiền 0 — mà không có lỗi nào.
    const than = JSON.stringify({ invoice: JSON.parse(HOA_DON_COD), somethingElse: 1 });

    const hd = await api(201, than).yeuCauThanhToan('ts', 'tst', 'COD', 'k');

    expect(hd.invoiceCode).toBe('HD1');
    expect(hd.totalAmount).toBe(120000);
  });

  it('phản hồi KHÔNG bọc cũng đọc được', async () => {
    const hd = await api(201, HOA_DON_COD).yeuCauThanhToan('ts', 'tst', 'COD', 'k');
    expect(hd.invoiceCode).toBe('HD1');
  });

  it('phân giải VietQR kèm nội dung chuyển khoản', async () => {
    const than = JSON.stringify({
      invoice: {
        invoiceCode: 'HD2',
        status: 'Pending',
        method: 'VietQR',
        totalAmount: 120000,
        items: [],
        vietQr: {
          amount: 120000,
          transferContent: 'VIAN TS0042',
          quickLink: 'https://img.vietqr.io/x.png',
        },
      },
    });

    const hd = await api(201, than).yeuCauThanhToan('ts', 'tst', 'VietQR', 'k');

    expect(hd.vietQr?.transferContent).toBe('VIAN TS0042');
    expect(hd.vietQr?.quickLink).toBe('https://img.vietqr.io/x.png');
  });
});

describe('dịch lỗi thanh toán', () => {
  const yc = (status: number, body: string) =>
    api(status, body).yeuCauThanhToan('ts', 'tst', 'VietQR', 'k');

  it('chưa cấu hình ngân hàng: chỉ ra lối thoát CÓ THẬT, không bảo thử lại', async () => {
    // Đây KHÔNG phải lỗi của khách, và thử lại sẽ hỏng y hệt.
    const loi = await yc(400, loiJson('VIETQR_CONFIG_MISSING')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('tiền mặt');
    expect(loi?.message).not.toContain('Thử lại');
  });

  it('đã yêu cầu rồi thì nói rõ đang chờ nhân viên', async () => {
    const loi = await yc(409, loiJson('TABLE_INVOICE_PAYMENT_PENDING')).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi?.message).toContain('Chờ nhân viên xác nhận');
  });

  it('bàn chưa có món thì nói đúng lý do', async () => {
    await expect(yc(400, loiJson('TABLE_INVOICE_EMPTY'))).rejects.toMatchObject({
      code: 'TABLE_INVOICE_EMPTY',
    });
  });

  it('502 HTML vẫn cho câu đọc được', async () => {
    await expect(yc(502, '<html>502</html>')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('mất mạng cho NETWORK_ERROR', async () => {
    const a = new HttpInvoiceApi('http://test', async () => {
      throw new Error('mạng chết');
    });
    await expect(a.hoaDon('ts', 'tst')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
