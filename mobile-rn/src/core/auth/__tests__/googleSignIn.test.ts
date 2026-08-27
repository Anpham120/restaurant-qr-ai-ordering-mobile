import { docIdToken, laHuyBo, taoLayTokenGoogle } from '../googleSignIn';

/**
 * Lớp nối với thư viện Google.
 *
 * Kiểm được mà không cần thư viện native, không cần dev build, không cần tài khoản Google — đó
 * chính là lý do lớp này được tách ra.
 */
describe('đọc idToken từ kết quả của thư viện', () => {
  it('đọc được dạng phẳng', () => {
    expect(docIdToken({ idToken: 'abc' })).toBe('abc');
  });

  it('đọc được dạng lồng trong data', () => {
    // Thư viện đổi hình dạng kết quả giữa các bản. Chốt đúng MỘT chỗ nghĩa là nâng cấp thư viện
    // xong thì đăng nhập hỏng, và câu báo lỗi sẽ đổ cho Google thay vì cho dòng đọc này.
    expect(docIdToken({ data: { idToken: 'abc' } })).toBe('abc');
  });

  it('không có token thì trả null, không trả undefined hay chuỗi rỗng', () => {
    // Trả undefined thì nó bò xuống tận backend rồi mới hỏng, ở nơi không ai đoán được nguyên do.
    expect(docIdToken({})).toBeNull();
    expect(docIdToken({ idToken: '' })).toBeNull();
    expect(docIdToken(null)).toBeNull();
    expect(docIdToken('abc')).toBeNull();
    expect(docIdToken({ data: null })).toBeNull();
  });
});

describe('nhận ra khách bấm huỷ', () => {
  it('nhận ra mã huỷ của thư viện', () => {
    expect(laHuyBo({ code: 'SIGN_IN_CANCELLED' })).toBe(true);
    expect(laHuyBo({ code: '-5' })).toBe(true);
    expect(laHuyBo({ code: -5 })).toBe(true);
  });

  it('lỗi THẬT thì không bị coi là huỷ', () => {
    // Coi lỗi thật là huỷ nghĩa là nuốt lỗi im lặng: khách bấm nút, không có gì xảy ra, và không
    // có câu nào giải thích.
    expect(laHuyBo({ code: 'DEVELOPER_ERROR' })).toBe(false);
    expect(laHuyBo(new Error('mạng rớt'))).toBe(false);
    expect(laHuyBo(null)).toBe(false);
  });
});

describe('dựng hàm lấy token', () => {
  function thuVienGia(ketQua: unknown, loi?: unknown) {
    return {
      daCauHinhVoi: null as string | null,
      soLanCauHinh: 0,
      configure(o: { webClientId: string }) {
        this.daCauHinhVoi = o.webClientId;
        this.soLanCauHinh += 1;
      },
      async hasPlayServices() {
        return true;
      },
      async signIn() {
        if (loi !== undefined) throw loi;
        return ketQua;
      },
    };
  }

  it('chưa có webClientId thì KHÔNG dựng hàm nào', () => {
    // LoginScreen nhận undefined thì không hiện nút. Dựng hàm ở đây nghĩa là nút hiện ra và bấm
    // vào chỉ để nhận lỗi cấu hình.
    expect(taoLayTokenGoogle('', thuVienGia({}))).toBeUndefined();
    expect(taoLayTokenGoogle('   ', thuVienGia({}))).toBeUndefined();
  });

  it('lấy được token và truyền ĐÚNG client id cho thư viện', async () => {
    const tv = thuVienGia({ data: { idToken: 'tok' } });

    const lay = taoLayTokenGoogle('abc.apps.googleusercontent.com', tv);

    expect(await lay?.()).toBe('tok');
    expect(tv.daCauHinhVoi).toBe('abc.apps.googleusercontent.com');
  });

  it('chỉ cấu hình MỘT lần dù bấm nhiều lần', async () => {
    const tv = thuVienGia({ idToken: 'tok' });
    const lay = taoLayTokenGoogle('abc', tv);

    await lay?.();
    await lay?.();

    expect(tv.soLanCauHinh).toBe(1);
  });

  it('khách huỷ Ở BẢN 16 (trả về, không ném) thì ra null', async () => {
    // Đây là đường huỷ THẬT của thư viện đang cài: signIn trả {type:"cancelled", data:null} chứ
    // không ném. Phép kiểm dưới lo đường ném của bản cũ và của các thao tác khác.
    const lay = taoLayTokenGoogle('abc', thuVienGia({ type: 'cancelled', data: null }));

    await expect(lay?.()).resolves.toBeNull();
  });

  it('khách huỷ thì trả null, KHÔNG ném', async () => {
    const lay = taoLayTokenGoogle('abc', thuVienGia(null, { code: 'SIGN_IN_CANCELLED' }));

    await expect(lay?.()).resolves.toBeNull();
  });

  it('lỗi thật thì NÉM ra ngoài, không nuốt thành null', async () => {
    // Nuốt thành null thì màn hình coi như khách huỷ: bấm nút, không phản hồi, không lời giải
    // thích. Lỗi cấu hình Google Cloud rơi đúng vào ca này và sẽ không ai tìm ra.
    const lay = taoLayTokenGoogle('abc', thuVienGia(null, { code: 'DEVELOPER_ERROR' }));

    await expect(lay?.()).rejects.toEqual({ code: 'DEVELOPER_ERROR' });
  });
});
