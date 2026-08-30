import { AuthException, HttpAuthApi } from '../authApi';
import { type GoiMang } from '../../mang/goiMang';

const THAN_CONG = JSON.stringify({
  accessToken: 'jwt.abc',
  expiresAt: '2026-08-20T15:24:15.752Z',
  user: { userId: 'u1', fullName: 'Nguyễn Văn A', email: 'a@example.com', role: 'Customer' },
});

function loiJson(code: string, message: string) {
  return JSON.stringify({ error: { code, message, details: {} } });
}

function apiTraVe(status: number, body: string, ghiLai?: jest.Mock) {
  const goi: GoiMang = async (url, init) => {
    ghiLai?.(url, init);
    return { status, text: async () => body };
  };
  return new HttpAuthApi('http://test', goi);
}

describe('HttpAuthApi', () => {
  it('gửi đúng đường dẫn và thân JSON mà backend Java chờ', async () => {
    const ghiLai = jest.fn();
    await apiTraVe(200, THAN_CONG, ghiLai).dangNhap('0901234567', 'matkhau123');

    const [url, init] = ghiLai.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://test/api/auth/login');
    expect(init.method).toBe('POST');
    // Tên trường phải là `identifier`, KHÔNG phải `email`.
    //
    // Backend đổi sang một ô cho cả hai loại người dùng (khách gõ số, nhân viên gõ email) nhưng
    // app vẫn gửi `email`. Jackson không thấy `identifier` nên để null, và AuthController chặn
    // ngay ở dòng đầu — 400 IDENTIFIER_REQUIRED, chưa từng tới bước kiểm mật khẩu. Đo trên máy
    // chủ thật: MỌI lượt đăng nhập từ app đều hỏng, không riêng ca nào.
    //
    // Phép kiểm cũ khẳng định đúng cái app đang gửi, nên nó xanh trong khi app chết. Hai bên tự
    // đồng ý với nhau; không có gì so app với backend. Đó là việc của `hopDongAuth.test.ts`.
    expect(JSON.parse(init.body as string)).toEqual({
      identifier: '0901234567',
      password: 'matkhau123',
    });
  });

  it('khai charset=utf-8 trong header', async () => {
    // Spring mặc định coi application/json là UTF-8 nên để trống vẫn chạy, nhưng một lần đo thật
    // trên dự án này đã cho ra "JSON parse error: Invalid UTF-8 middle byte" vì thiếu nó.
    const ghiLai = jest.fn();
    await apiTraVe(200, THAN_CONG, ghiLai).dangNhap('a@example.com', 'x');

    const [, init] = ghiLai.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toContain('charset=utf-8');
  });

  it('phân giải phiên từ phản hồi 200', async () => {
    const s = await apiTraVe(200, THAN_CONG).dangNhap('a@example.com', 'x');

    expect(s.accessToken).toBe('jwt.abc');
    expect(s.user.role).toBe('Customer');
    expect(s.expiresAt).toBe('2026-08-20T15:24:15.752Z');
  });

  it('đọc đúng tiếng Việt có dấu trong tên', async () => {
    const s = await apiTraVe(200, THAN_CONG).dangNhap('a@example.com', 'x');
    expect(s.user.fullName).toBe('Nguyễn Văn A');
  });
});

describe('dịch lỗi theo MÃ, không hiển thị câu tiếng Anh của máy chủ', () => {
  it('401 INVALID_CREDENTIALS', async () => {
    const api = apiTraVe(401, loiJson('INVALID_CREDENTIALS', 'Email or password is incorrect.'));

    await expect(api.dangNhap('a@example.com', 'sai')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Số điện thoại, email hoặc mật khẩu không đúng.',
    });
  });

  it('không rò câu tiếng Anh của máy chủ ra màn hình', async () => {
    // Bản đầu của ca này viết `rejects.toThrow(expect.not.stringContaining(...))` và nó KHÔNG
    // BAO GIỜ đỏ được: `toThrow` chỉ nhận chuỗi, regex, Error hoặc lớp — asymmetric matcher bị
    // bỏ qua lặng lẽ. Đột biến cho `dichLoi` trả nguyên câu tiếng Anh của máy chủ vẫn để ca
    // này xanh. Bắt lỗi rồi đọc thẳng `.message` là cách duy nhất kiểm được điều muốn kiểm.
    const api = apiTraVe(401, loiJson('INVALID_CREDENTIALS', 'Email or password is incorrect.'));

    const loi = await api.dangNhap('a@example.com', 'sai').then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(loi).not.toBeNull();
    expect(loi!.message).not.toContain('Email or password');
  });

  it('400 IDENTIFIER_REQUIRED', async () => {
    // Thay cho ca EMAIL_INVALID cũ: `/login` không còn phát mã đó nữa. AuthController chỉ ném ba
    // mã — IDENTIFIER_REQUIRED, PASSWORD_REQUIRED, INVALID_CREDENTIALS.
    const api = apiTraVe(400, loiJson('IDENTIFIER_REQUIRED', 'Nhập số điện thoại hoặc email.'));
    await expect(api.dangNhap('', 'x')).rejects.toMatchObject({ code: 'IDENTIFIER_REQUIRED' });
  });

  it('502 trả thân HTML của nginx vẫn cho câu đọc được', async () => {
    // Thân không phải JSON là chuyện có thật khi reverse proxy chết. Nếu JSON.parse ném ra mà
    // không ai bắt, người dùng thấy màn hình đỏ thay vì một câu thông báo.
    const api = apiTraVe(502, '<html><body>502 Bad Gateway</body></html>');

    await expect(api.dangNhap('a@example.com', 'x')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      message: expect.stringContaining('Thử lại sau') as unknown as string,
    });
  });

  it('mất mạng cho mã NETWORK_ERROR, không phải "sai mật khẩu"', async () => {
    // Bảo khách kiểm tra lại mật khẩu trong khi thực ra rớt wifi là cách nhanh nhất khiến họ đổi
    // mật khẩu một cách vô ích.
    const api = new HttpAuthApi('http://test', async () => {
      throw new Error('mạng chết');
    });

    await expect(api.dangNhap('a@example.com', 'x')).rejects.toBeInstanceOf(AuthException);
    await expect(api.dangNhap('a@example.com', 'x')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});
