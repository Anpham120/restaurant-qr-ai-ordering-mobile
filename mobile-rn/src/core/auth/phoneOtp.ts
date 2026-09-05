/**
 * Chỗ DUY NHẤT trong dự án chạm vào thư viện xác minh số điện thoại của Firebase.
 *
 * Mọi thứ khác — màn đăng ký, `AuthRepository`, `authApi` — chỉ làm việc với hai thứ: một hàm gửi
 * mã, và một chuỗi ID token. Nhờ vậy toàn bộ luồng kiểm chứng được bằng bản giả, không cần thư
 * viện native, không cần dev build, không cần số điện thoại thật; và nếu sau này đổi nhà cung cấp
 * OTP thì chỉ tệp này đổi.
 *
 * Thư viện là native module nên **không chạy trên Expo Go** — phải build dev client. Dự án đã cần
 * dev client sẵn cho `@react-native-google-signin`, nên đây không phải ràng buộc mới.
 */

/** Một lượt xác minh đang chờ khách nhập mã. */
export interface ChoNhapMa {
  /**
   * Đổi mã sáu chữ số lấy ID token của Firebase.
   *
   * Ném khi mã sai hoặc hết hạn — màn hình dịch sang câu người dùng đọc được.
   */
  xacNhan(ma: string): Promise<string>;
}

/** Gửi mã tới một số điện thoại và trả về lượt chờ tương ứng. */
export type GuiMaOtp = (soDienThoai: string) => Promise<ChoNhapMa>;

/** Mã quốc gia Việt Nam. */
const MA_QUOC_GIA = '84';

/**
 * Đổi số khách gõ sang dạng E.164 mà Firebase bắt buộc.
 *
 * Khách gõ `0901234567`; Firebase chỉ nhận `+84901234567`. Gửi dạng trong nước thì thư viện báo
 * lỗi định dạng, và câu lỗi đó nói về "invalid phone number" — nghe như số của khách sai, trong
 * khi số hoàn toàn đúng và lỗi nằm ở dòng chuyển đổi này.
 *
 * Đây là chiều NGƯỢC của `PhoneNumber.normalize` bên máy chủ: máy chủ quy mọi thứ về dạng trong
 * nước để làm khoá, app quy về dạng quốc tế để gọi Firebase. Hai chiều phải khớp nhau, nếu không
 * khách đăng ký xong không đăng nhập lại được bằng số mình vừa gõ.
 *
 * @returns `null` khi chuỗi không phải một số Việt Nam hợp lệ — màn hình chặn trước khi gọi mạng.
 */
export function sangE164(so: string): string | null {
  const chuSo = so.replace(/\D/g, '');
  if (chuSo.length === 0) return null;

  // Đã kèm mã quốc gia: 84 + 9 hoặc 10 chữ số.
  if (chuSo.startsWith(MA_QUOC_GIA) && (chuSo.length === 11 || chuSo.length === 12)) {
    return `+${chuSo}`;
  }

  // Dạng trong nước: mở đầu bằng 0, 10 chữ số (di động) hoặc 11 (cố định có mã vùng).
  if (chuSo.startsWith('0') && (chuSo.length === 10 || chuSo.length === 11)) {
    return `+${MA_QUOC_GIA}${chuSo.slice(1)}`;
  }

  return null;
}

/**
 * Hình dạng tối thiểu mà mã này cần ở thư viện. Khai ở đây để không kéo kiểu của nó ra khắp nơi.
 *
 * Đây là API **modular**. `@react-native-firebase` bản 26 đã BỎ HẲN API cũ dạng `auth().xxx()` —
 * gói không còn `export default` nào. Viết theo lối cũ vẫn biên dịch trót lọt vì `require` trả
 * `any`, rồi chết lúc chạy trên máy thật bằng "auth is not a function" — tức lỗi chỉ lộ ra ở khâu
 * đắt nhất để phát hiện. Đã kiểm chứng bằng chính tệp .d.ts trong node_modules.
 */
interface ThuVienFirebase {
  getAuth(): unknown;
  signInWithPhoneNumber(
    auth: unknown,
    soDienThoai: string,
  ): Promise<{
    /** Trả `UserCredential | null` — xem `ConfirmationResult.d.ts`. Chỗ `null` đó có thật. */
    confirm(ma: string): Promise<{ user: { getIdToken(): Promise<string> } } | null>;
  }>;
}

/**
 * Dựng hàm gửi mã từ một thư viện bất kỳ có đúng hình dạng trên.
 *
 * Tách khỏi {@link layGuiMaOtpThat} để kiểm được bằng bản giả.
 */
export function taoGuiMaOtp(thuVien: ThuVienFirebase): GuiMaOtp {
  return async (soDienThoai: string) => {
    const e164 = sangE164(soDienThoai);
    if (e164 === null) {
      throw new Error('SO_DIEN_THOAI_KHONG_HOP_LE');
    }

    const luot = await thuVien.signInWithPhoneNumber(thuVien.getAuth(), e164);

    return {
      async xacNhan(ma: string): Promise<string> {
        const ketQua = await luot.confirm(ma);
        // `confirm` khai kiểu trả về là `UserCredential | null`. Trả `null` mà cứ đọc `.user` thì
        // app chết bằng một lỗi nói về `undefined`, không nói gì về mã xác minh.
        if (ketQua === null) {
          throw new Error('XAC_MINH_THAT_BAI');
        }
        return ketQua.user.getIdToken();
      },
    };
  };
}

/**
 * Bản dùng thật: nối {@link taoGuiMaOtp} với thư viện native.
 *
 * Bọc `require` trong try/catch có chủ đích — cùng lý do như `googleSignIn.ts`. Thư viện là native
 * module nên KHÔNG có trên Expo Go; import tĩnh làm app chết ngay lúc mở. Bắt lỗi ở đây nghĩa là:
 * có thư viện thì hiện đường đăng ký bằng số, không có thì app vẫn chạy y như trước.
 *
 * Trả `undefined` = màn hình KHÔNG hiện nút đăng ký bằng số điện thoại. Hiện một nút bấm vào chỉ
 * để nhận lỗi còn tệ hơn không có nút.
 */
export function layGuiMaOtpThat(): GuiMaOtp | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-firebase/auth') as Partial<ThuVienFirebase>;
    // Kiểm hình dạng thay vì tin vào phép ép kiểu. `require` trả `any`, nên ép kiểu ở đây không
    // kiểm chứng gì cả — đổi phiên bản thư viện mà đổi luôn API thì mã vẫn biên dịch và chỉ chết
    // trên máy thật. Bản 26 đã bỏ API cũ đúng theo kiểu đó một lần rồi.
    if (typeof mod.getAuth !== 'function' || typeof mod.signInWithPhoneNumber !== 'function') {
      return undefined;
    }
    return taoGuiMaOtp(mod as ThuVienFirebase);
  } catch {
    return undefined;
  }
}
