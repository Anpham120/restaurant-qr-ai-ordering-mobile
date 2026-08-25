import { type AuthApi, AuthException } from '../authApi';
import { AuthRepository } from '../authRepository';
import { type AuthSession } from '../authSession';
import { type TokenStore } from '../tokenStore';

const MOC = new Date('2026-08-20T12:00:00Z');

function phien(hetHan: Date): AuthSession {
  return {
    accessToken: 'jwt',
    expiresAt: hetHan.toISOString(),
    user: { userId: 'u1', fullName: 'A', email: 'a@example.com', role: 'Customer' },
  };
}

function gio(theoGio: number): Date {
  return new Date(MOC.getTime() + theoGio * 3_600_000);
}

class StoreGiaLap implements TokenStore {
  private dang: AuthSession | null = null;
  soLanXoa = 0;

  async doc() {
    return this.dang;
  }
  async luu(session: AuthSession) {
    this.dang = session;
  }
  async xoa() {
    this.soLanXoa++;
    this.dang = null;
  }
}

class ApiGiaLap implements AuthApi {
  emailDaNhan: string | null = null;

  constructor(private readonly ketQua: AuthSession | AuthException) {}

  async dangNhap(email: string): Promise<AuthSession> {
    this.emailDaNhan = email;
    if (this.ketQua instanceof AuthException) throw this.ketQua;
    return this.ketQua;
  }

  async dangKy(_hoTen: string, email: string): Promise<AuthSession> {
    return this.dangNhap(email);
  }
}

describe('AuthRepository', () => {
  it('đăng nhập thành công thì cất phiên vào máy', async () => {
    const store = new StoreGiaLap();
    const repo = new AuthRepository(new ApiGiaLap(phien(gio(2))), store, () => MOC);

    await repo.dangNhap('a@example.com', 'matkhau123');

    expect(await store.doc()).not.toBeNull();
  });

  it('cắt khoảng trắng quanh email trước khi gửi', async () => {
    // Bàn phím di động chèn dấu cách sau gợi ý email. Backend so khớp nguyên văn, nên dấu cách vô
    // hình biến thành "sai mật khẩu" mà không ai giải thích được.
    const api = new ApiGiaLap(phien(gio(2)));
    const repo = new AuthRepository(api, new StoreGiaLap(), () => MOC);

    await repo.dangNhap('  a@example.com ', 'matkhau123');

    expect(api.emailDaNhan).toBe('a@example.com');
  });

  it('đăng nhập hỏng thì KHÔNG cất gì cả', async () => {
    const store = new StoreGiaLap();
    const repo = new AuthRepository(
      new ApiGiaLap(new AuthException('INVALID_CREDENTIALS', 'sai')),
      store,
      () => MOC,
    );

    await expect(repo.dangNhap('a@example.com', 'sai')).rejects.toBeInstanceOf(AuthException);
    expect(await store.doc()).toBeNull();
  });

  describe('khoiPhuc', () => {
    it('token còn hạn thì trả về phiên', async () => {
      const store = new StoreGiaLap();
      await store.luu(phien(gio(2)));
      const repo = new AuthRepository(new ApiGiaLap(phien(MOC)), store, () => MOC);

      expect(await repo.khoiPhuc()).not.toBeNull();
      expect(store.soLanXoa).toBe(0);
    });

    it('token hết hạn thì trả null VÀ XOÁ khỏi máy', async () => {
      // Phần "và xoá" mới là điểm chính. Chỉ trả null mà để token nằm lại nghĩa là giữ một chuỗi
      // bí mật không còn dùng được nhưng vẫn đọc được nếu máy rơi vào tay người khác.
      const store = new StoreGiaLap();
      await store.luu(phien(new Date(MOC.getTime() - 5 * 60_000)));
      const repo = new AuthRepository(new ApiGiaLap(phien(MOC)), store, () => MOC);

      expect(await repo.khoiPhuc()).toBeNull();
      expect(store.soLanXoa).toBe(1);
      expect(await store.doc()).toBeNull();
    });

    it('máy chưa có gì thì trả null, không xoá vô ích', async () => {
      const store = new StoreGiaLap();
      const repo = new AuthRepository(new ApiGiaLap(phien(MOC)), store, () => MOC);

      expect(await repo.khoiPhuc()).toBeNull();
      expect(store.soLanXoa).toBe(0);
    });
  });

  it('đăng xuất xoá phiên khỏi máy', async () => {
    const store = new StoreGiaLap();
    await store.luu(phien(gio(2)));
    const repo = new AuthRepository(new ApiGiaLap(phien(MOC)), store, () => MOC);

    await repo.dangXuat();

    expect(await store.doc()).toBeNull();
  });
});
