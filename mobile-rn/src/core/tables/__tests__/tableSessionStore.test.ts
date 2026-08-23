import { khoTrongBoNho } from '../../luuTruAnToan';
import { type TableSession } from '../tableSession';
import { SecureTableSessionStore } from '../tableSessionStore';

const PHIEN: TableSession = {
  sessionId: 'ts_abc',
  tableCode: 'T01',
  tableDisplayName: 'Ban 01',
  status: 'Open',
  expiresAt: '2026-08-20T16:00:00.000Z',
  isExpired: false,
  tableSessionToken: 'tst_bi_mat',
  resumeState: 'FreshStart',
  qrToken: 'cmc-table-t01-qr',
};

describe('SecureTableSessionStore', () => {
  it('lưu rồi đọc lại được nguyên phiên, KỂ CẢ qrToken', async () => {
    // qrToken không có trong phản hồi backend nhưng bắt buộc phải sống sót qua lần mở app sau:
    // POST /api/orders đòi nó, và thiếu là 400 DINE_IN_TABLE_REQUIRED.
    const store = new SecureTableSessionStore(khoTrongBoNho());
    await store.luu(PHIEN);

    expect(await store.doc()).toEqual(PHIEN);
  });

  it('chưa vào bàn thì đọc ra null', async () => {
    expect(await new SecureTableSessionStore(khoTrongBoNho()).doc()).toBeNull();
  });

  it('dữ liệu hỏng thì XOÁ luôn', async () => {
    const kho = khoTrongBoNho({ table_session_v1: 'không phải json' });

    expect(await new SecureTableSessionStore(kho).doc()).toBeNull();
    expect(await kho.doc('table_session_v1')).toBeNull();
  });

  it('bản lưu từ phiên bản cũ thiếu qrToken thì thành chuỗi rỗng, không phải undefined', async () => {
    // Bản lưu cũ hơn ghi chú #29 sẽ không có trường này. Đọc ra `undefined` rồi nhét vào thân
    // JSON của lệnh đặt món cho ra `"qrToken":null` — backend trả QR_TOKEN_INVALID chứ không
    // trả một lỗi nói rằng app đang thiếu dữ liệu.
    const { qrToken: _bo, ...cu } = PHIEN;
    const kho = khoTrongBoNho({ table_session_v1: JSON.stringify(cu) });

    expect((await new SecureTableSessionStore(kho).doc())?.qrToken).toBe('');
  });
});
