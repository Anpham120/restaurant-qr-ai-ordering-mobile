import { type AuthApi } from '../../auth/authApi';
import { AuthRepository } from '../../auth/authRepository';
import { type AuthSession } from '../../auth/authSession';
import { type TokenStore } from '../../auth/tokenStore';
import { type TableSession } from '../tableSession';
import { type MoPhienTuyChon, type TableSessionApi } from '../tableSessionApi';
import { TableSessionRepository } from '../tableSessionRepository';
import { type TableSessionStore } from '../tableSessionStore';

const MOC = new Date('2026-08-20T12:00:00Z');
const gio = (h: number) => new Date(MOC.getTime() + h * 3_600_000).toISOString();
const phut = (m: number) => new Date(MOC.getTime() + m * 60_000).toISOString();

function phienBan(hetHan = gio(4), isExpired = false): TableSession {
  return {
    sessionId: 'ts_abc',
    tableCode: 'T01',
    tableDisplayName: 'Ban 01',
    status: 'Open',
    expiresAt: hetHan,
    isExpired,
    tableSessionToken: 'tst_bi_mat',
    resumeState: 'FreshStart',
    qrToken: 'cmc-table-t01-qr',
  };
}

function phienDangNhap(hetHan = gio(1)): AuthSession {
  return {
    accessToken: 'jwt.cua.khach',
    expiresAt: hetHan,
    user: { userId: 'u1', fullName: 'A', email: 'a@example.com', role: 'Customer' },
  };
}

class AuthStoreGiaLap implements TokenStore {
  private dang: AuthSession | null = null;
  async doc() {
    return this.dang;
  }
  async luu(s: AuthSession) {
    this.dang = s;
  }
  async xoa() {
    this.dang = null;
  }
}

class BanStoreGiaLap implements TableSessionStore {
  private dang: TableSession | null = null;
  soLanXoa = 0;
  async doc() {
    return this.dang;
  }
  async luu(s: TableSession) {
    this.dang = s;
  }
  async xoa() {
    this.soLanXoa++;
    this.dang = null;
  }
}

class BanApiGiaLap implements TableSessionApi {
  daGoi = false;
  tokenDaNhan: string | null | undefined;
  maBanDaNhan: string | null | undefined;

  constructor(private readonly tra: TableSession) {}

  async moPhien(_qrToken: string, tuyChon: MoPhienTuyChon = {}): Promise<TableSession> {
    this.daGoi = true;
    this.tokenDaNhan = tuyChon.accessToken;
    this.maBanDaNhan = tuyChon.tableCode;
    return this.tra;
  }
}

const authApiGiaLap: AuthApi = {
  dangNhapGoogle: async () => {
    throw new Error("khong dung toi");
  },
  dangNhap: async () => {
    throw new Error('không dùng tới trong bộ test này');
  },
  dangKy: async () => {
    throw new Error('không dùng tới trong bộ test này');
  },
};

function dung() {
  const authStore = new AuthStoreGiaLap();
  const api = new BanApiGiaLap(phienBan());
  const store = new BanStoreGiaLap();
  const repo = new TableSessionRepository(
    api,
    store,
    new AuthRepository(authApiGiaLap, authStore, () => MOC),
    () => MOC,
  );
  return { repo, api, store, authStore };
}

describe('đính token của khách khi mở phiên', () => {
  it('đang đăng nhập thì token được chuyển xuống lớp gọi mạng', async () => {
    const d = dung();
    await d.authStore.luu(phienDangNhap());

    await d.repo.moPhien('cmc-table-t01-qr', 'T01');

    expect(d.api.tokenDaNhan).toBe('jwt.cua.khach');
  });

  it('chưa đăng nhập thì vẫn mở được phiên, chỉ là không gắn tài khoản', async () => {
    // App phải dùng được cho khách vãng lai đúng như web. Nếu chỗ này ném lỗi thì app biến thành
    // bắt buộc đăng nhập — một quyết định sản phẩm không ai ra.
    const d = dung();

    const phien = await d.repo.moPhien('cmc-table-t01-qr');

    expect(d.api.daGoi).toBe(true);
    expect(d.api.tokenDaNhan).toBeNull();
    expect(phien.tableCode).toBe('T01');
  });

  it('token đăng nhập ĐÃ HẾT HẠN thì không được gửi đi', async () => {
    // Lấy token qua AuthRepository.khoiPhuc() chính là để có luật này miễn phí. Nếu cache riêng
    // một bản token ở đây thì app sẽ lặng lẽ gửi token chết và nhận 401 khó hiểu.
    const d = dung();
    await d.authStore.luu(phienDangNhap(phut(-5)));

    await d.repo.moPhien('cmc-table-t01-qr');

    expect(d.api.tokenDaNhan).toBeNull();
  });

  it('cắt khoảng trắng quanh mã QR và mã bàn trước khi gửi', async () => {
    // Ô nhập tay là đường vào chính của mã QR khi camera không đọc được, và bàn phím di động chèn
    // dấu cách sau khi dán.
    const d = dung();

    await d.repo.moPhien('  cmc-table-t01-qr ', ' T01 ');

    expect(d.api.maBanDaNhan).toBe('T01');
  });
});

it('mở phiên xong thì cất lại để lần mở app sau còn dùng', async () => {
  const d = dung();

  await d.repo.moPhien('cmc-table-t01-qr');

  expect(await d.store.doc()).not.toBeNull();
});

describe('khoiPhuc', () => {
  it('phiên còn hạn thì trả về', async () => {
    const d = dung();
    await d.store.luu(phienBan());

    expect(await d.repo.khoiPhuc()).not.toBeNull();
    expect(d.store.soLanXoa).toBe(0);
  });

  it('phiên quá hạn thì trả null VÀ XOÁ khỏi máy', async () => {
    const d = dung();
    await d.store.luu(phienBan(phut(-1)));

    expect(await d.repo.khoiPhuc()).toBeNull();
    expect(d.store.soLanXoa).toBe(1);
  });

  it('backend báo isExpired thì tin backend, kể cả khi đồng hồ máy nói còn hạn', async () => {
    // Đồng hồ điện thoại có thể lệch. Phiên bàn do backend đóng (nhân viên chốt bàn), nên cờ
    // isExpired là sự thật, còn expiresAt chỉ là dự đoán.
    const d = dung();
    await d.store.luu(phienBan(gio(4), true));

    expect(await d.repo.khoiPhuc()).toBeNull();
    expect(d.store.soLanXoa).toBe(1);
  });

  it('máy chưa có phiên nào thì trả null, không xoá vô ích', async () => {
    const d = dung();

    expect(await d.repo.khoiPhuc()).toBeNull();
    expect(d.store.soLanXoa).toBe(0);
  });
});

it('rời bàn thì xoá phiên khỏi máy', async () => {
  const d = dung();
  await d.store.luu(phienBan());

  await d.repo.roiBan();

  expect(await d.store.doc()).toBeNull();
});
