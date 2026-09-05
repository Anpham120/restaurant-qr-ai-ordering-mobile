import * as fs from 'fs';
import * as path from 'path';

import { type GoiMang } from '../../mang/goiMang';
import { HttpAuthApi } from '../authApi';

/**
 * Tên trường app gửi phải khớp tên trường backend đọc.
 *
 * <p>Mọi phép kiểm khác của `authApi` đều khẳng định đúng cái app ĐANG gửi. Chúng xanh khi app
 * và backend nói hai thứ tiếng khác nhau, vì không cái nào nhìn sang phía bên kia — app tự đồng
 * ý với chính nó. Phép kiểm này đọc thẳng `AuthDtos.java` nên nó chỉ xanh khi hai bên thật sự
 * khớp.
 *
 * <p>LỖI CÓ THẬT đã sống nhờ chỗ trống này, đo trên máy chủ đang chạy:
 *
 * <pre>
 *   app gửi {email, password}       → 400 IDENTIFIER_REQUIRED
 *   backend đọc {identifier, ...}   → 401 INVALID_CREDENTIALS  (tới được bước kiểm mật khẩu)
 * </pre>
 *
 * <p>Không ai đăng nhập được từ app — không riêng ca hiếm nào, mà MỌI lượt. Bộ kiểm vẫn xanh
 * suốt thời gian đó. Cùng lúc, `/register` đổi sang `phoneIdToken` và app vẫn gửi `email`.
 *
 * <p>Lỗi kiểu này không làm sập gì cả: cả hai bên chạy bình thường, chỉ có điều không nói chuyện
 * được với nhau. Nó chỉ lộ ra khi có người mở app lên và thử — tức là muộn nhất có thể.
 */
const DTOS = path.resolve(
  __dirname,
  '../../../../../backend-java/src/main/java/com/cmc/restaurant/auth/AuthDtos.java',
);

const THAN_CONG = JSON.stringify({
  accessToken: 'jwt.abc',
  expiresAt: '2026-08-20T15:24:15.752Z',
  user: { userId: 'u1', fullName: 'Nguyễn Văn A', email: null, role: 'Customer' },
});

/** Tên các thành phần của một `record` trong AuthDtos.java. */
function truongCua(tenRecord: string): string[] {
  const nguon = fs.readFileSync(DTOS, 'utf8');
  const khop = new RegExp(`record\\s+${tenRecord}\\s*\\(([^)]*)\\)`).exec(nguon);
  const thamSo = khop?.[1];
  if (thamSo === undefined) throw new Error(`không thấy record ${tenRecord} trong ${DTOS}`);

  // "String fullName, String phoneIdToken, String password" → tên là từ thứ hai của mỗi cụm.
  return thamSo.split(',').flatMap((cum) => {
    const ten = cum.trim().split(/\s+/)[1];
    return ten === undefined ? [] : [ten];
  });
}

/** Chạy thật một lượt gọi rồi trả về các khoá của thân JSON lượt ĐẦU tiên. */
async function khoaAppGui(goi: (api: HttpAuthApi) => Promise<unknown>): Promise<string[]> {
  const ghiLai = jest.fn();
  const gia: GoiMang = async (url, init) => {
    ghiLai(url, init);
    // `dangKy` gọi tiếp `/login`, nên phải trả được cả 201 lẫn 200.
    return { status: url.endsWith('/register') ? 201 : 200, text: async () => THAN_CONG };
  };

  await goi(new HttpAuthApi('http://test', gia));

  const [, init] = ghiLai.mock.calls[0] as [string, RequestInit];
  return Object.keys(JSON.parse(init.body as string)).sort();
}

describe('app gửi đúng tên trường mà AuthDtos.java khai', () => {
  it('đọc được AuthDtos.java — không đọc được thì mọi ca dưới đều so tập rỗng', () => {
    // Không có ca này thì đổi cấu trúc thư mục sẽ làm cả nhóm này luôn xanh mà không kiểm gì.
    expect(truongCua('LoginRequest')).not.toHaveLength(0);
  });

  it('LoginRequest', async () => {
    expect(await khoaAppGui((api) => api.dangNhap('0901234567', 'matkhau123'))).toEqual(
      truongCua('LoginRequest').sort(),
    );
  });

  it('RegisterRequest', async () => {
    expect(
      await khoaAppGui((api) => api.dangKy('Nguyễn Văn A', 'tok', '0901234567', 'matkhau123')),
    ).toEqual(truongCua('RegisterRequest').sort());
  });

  it('GoogleLoginRequest', async () => {
    expect(await khoaAppGui((api) => api.dangNhapGoogle('tok'))).toEqual(
      truongCua('GoogleLoginRequest').sort(),
    );
  });
});
