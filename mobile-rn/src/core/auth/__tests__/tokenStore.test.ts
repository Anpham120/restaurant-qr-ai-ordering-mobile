import { khoTrongBoNho } from '../../luuTruAnToan';
import { SecureTokenStore } from '../tokenStore';

const NGUOI = { userId: 'u1', fullName: 'Khách', email: 'k@local.test', role: 'Customer' };
const PHIEN = { accessToken: 'tok', expiresAt: '2026-08-23T11:00:00.000Z', user: NGUOI };

describe('SecureTokenStore', () => {
  it('lưu rồi đọc lại được nguyên phiên', async () => {
    const store = new SecureTokenStore(khoTrongBoNho());
    await store.luu(PHIEN);

    expect(await store.doc()).toEqual(PHIEN);
  });

  it('chưa lưu gì thì đọc ra null', async () => {
    expect(await new SecureTokenStore(khoTrongBoNho()).doc()).toBeNull();
  });

  it('xoá rồi thì đọc ra null', async () => {
    const store = new SecureTokenStore(khoTrongBoNho());
    await store.luu(PHIEN);
    await store.xoa();

    expect(await store.doc()).toBeNull();
  });

  it('dữ liệu hỏng thì XOÁ luôn, không để app kẹt mỗi lần mở', async () => {
    // Người dùng không có cách nào tự dọn Keychain. Đọc ra null mà vẫn để rác lại thì lần mở sau
    // vẫn hỏng y hệt.
    const kho = khoTrongBoNho({ auth_session_v1: '{ không phải json' });
    const store = new SecureTokenStore(kho);

    expect(await store.doc()).toBeNull();
    expect(await kho.doc('auth_session_v1')).toBeNull();
  });

  it('JSON hợp lệ nhưng hạn hỏng cũng bị xoá', async () => {
    // Ca này khác ca trên: JSON.parse chạy được, chỗ ném là lúc đọc ngày. Thiếu nó thì một bản
    // lưu từ phiên bản cũ với định dạng ngày khác sẽ làm app ném ra ngoài lớp lưu trữ.
    const kho = khoTrongBoNho({
      auth_session_v1: JSON.stringify({ accessToken: 't', expiresAt: 'rác', user: NGUOI }),
    });

    expect(await new SecureTokenStore(kho).doc()).toBeNull();
    expect(await kho.doc('auth_session_v1')).toBeNull();
  });
});
