import { sangE164, taoGuiMaOtp } from '../phoneOtp';

describe('sangE164 — đổi số khách gõ sang dạng Firebase bắt buộc', () => {
  it('số di động trong nước', () => {
    // Đây là đường đi thường gặp nhất: khách gõ đúng cách người Việt viết số.
    expect(sangE164('0901234567')).toBe('+84901234567');
  });

  it('bỏ dấu cách, gạch và ngoặc', () => {
    expect(sangE164('0901 234 567')).toBe('+84901234567');
    expect(sangE164('0901-234-567')).toBe('+84901234567');
    expect(sangE164('(090) 123 4567')).toBe('+84901234567');
  });

  it('đã ở dạng quốc tế thì giữ nguyên', () => {
    expect(sangE164('+84901234567')).toBe('+84901234567');
    expect(sangE164('84901234567')).toBe('+84901234567');
    expect(sangE164('+84 901 234 567')).toBe('+84901234567');
  });

  it('số cố định có mã vùng', () => {
    expect(sangE164('02838221234')).toBe('+842838221234');
  });

  it('khớp NGƯỢC với chuẩn hoá của máy chủ', () => {
    // Máy chủ quy mọi thứ về dạng trong nước để làm khoá; app quy về dạng quốc tế để gọi Firebase.
    // Hai chiều phải khớp, nếu không khách đăng ký xong không đăng nhập lại được bằng số vừa gõ.
    //
    // `PhoneNumber.normalize("+84901234567")` bên Java trả "0901234567" — chính là chuỗi dưới đây
    // trước khi đổi. Ca này canh việc hai bên không trôi khỏi nhau.
    expect(sangE164('0901234567')).toBe('+84901234567');
  });

  it('trả null cho chuỗi không phải số Việt Nam', () => {
    // Chặn tại chỗ để khỏi gọi mạng rồi nhận về câu lỗi tiếng Anh của Firebase nói "invalid phone
    // number" — nghe như số của khách sai.
    expect(sangE164('')).toBeNull();
    expect(sangE164('khong-phai-so')).toBeNull();
    expect(sangE164('123')).toBeNull();
    expect(sangE164('090123456')).toBeNull(); // 9 chữ số, thiếu một
    expect(sangE164('09012345678901')).toBeNull(); // quá dài
  });
});

describe('taoGuiMaOtp', () => {
  /**
   * Bản giả theo API **modular** của `@react-native-firebase` bản 26.
   *
   * Bản 26 đã bỏ hẳn lối cũ `auth().signInWithPhoneNumber(...)` — gói không còn `export default`.
   * Bản giả này cố tình dựng đúng hình dạng mới, nên nếu mã sản phẩm quay về lối cũ thì phép kiểm
   * đỏ ngay ở đây thay vì chết trên máy thật.
   */
  function thuVienGia(token = 'id-token-cua-firebase') {
    const daGoi: { so?: string; ma?: string; authDaTruyen?: unknown } = {};
    const AUTH = { day: 'la-doi-tuong-auth' };
    const thuVien = {
      getAuth: () => AUTH,
      async signInWithPhoneNumber(auth: unknown, so: string) {
        daGoi.authDaTruyen = auth;
        daGoi.so = so;
        return {
          async confirm(ma: string) {
            daGoi.ma = ma;
            return { user: { getIdToken: async () => token } };
          },
        };
      },
    };
    return { thuVien, daGoi, AUTH };
  }

  it('gửi số đã đổi sang dạng E.164, không gửi nguyên chuỗi khách gõ', async () => {
    const { thuVien, daGoi } = thuVienGia();

    await taoGuiMaOtp(thuVien)('0901234567');

    expect(daGoi.so).toBe('+84901234567');
  });

  it('xác nhận mã thì trả về ID token', async () => {
    const { thuVien, daGoi } = thuVienGia('tok-abc');

    const cho = await taoGuiMaOtp(thuVien)('0901234567');
    const token = await cho.xacNhan('123456');

    expect(daGoi.ma).toBe('123456');
    expect(token).toBe('tok-abc');
  });

  it('truyền đối tượng auth của getAuth() vào signInWithPhoneNumber', async () => {
    // API modular nhận `auth` làm THAM SỐ ĐẦU. Quên nó thì thư viện nhận số điện thoại vào chỗ
    // `auth` và số vào chỗ `_appVerifier` — sai hoàn toàn, mà TypeScript không cản được vì
    // `require` trả `any`.
    const { thuVien, daGoi, AUTH } = thuVienGia();

    await taoGuiMaOtp(thuVien)('0901234567');

    expect(daGoi.authDaTruyen).toBe(AUTH);
  });

  it('số sai định dạng thì ném NGAY, không gọi thư viện', async () => {
    let daGoi = false;
    const thuVien = {
      getAuth: () => ({}),
      async signInWithPhoneNumber() {
        daGoi = true;
        throw new Error('không được tới đây');
      },
    };

    await expect(taoGuiMaOtp(thuVien)('123')).rejects.toThrow('SO_DIEN_THOAI_KHONG_HOP_LE');
    expect(daGoi).toBe(false);
  });

  it('confirm trả null thì ném lỗi rõ ràng, không đọc .user của null', async () => {
    // Thư viện khai kiểu trả về là `UserCredential | null` — xem `ConfirmationResult.d.ts`. Đọc
    // thẳng `.user` thì app chết bằng một lỗi nói về `undefined`, không nói gì về mã xác minh.
    const thuVien = {
      getAuth: () => ({}),
      async signInWithPhoneNumber() {
        return { async confirm() { return null; } };
      },
    };

    const cho = await taoGuiMaOtp(thuVien)('0901234567');

    await expect(cho.xacNhan('123456')).rejects.toThrow('XAC_MINH_THAT_BAI');
  });
});
