import { type LayTokenGoogle } from '../../ui/LoginScreen';
import { GOOGLE_WEB_CLIENT_ID } from './googleClientId';

/**
 * Chỗ DUY NHẤT trong dự án chạm vào thư viện đăng nhập Google.
 *
 * Mọi thứ khác — `LoginScreen`, `AuthRepository`, `authApi` — chỉ làm việc với một chuỗi ID token
 * và một hàm trả về chuỗi đó. Nhờ vậy toàn bộ luồng kiểm chứng được bằng bản giả, không cần thư
 * viện native, không cần dev build, không cần tài khoản Google thật; và nếu sau này đổi sang thư
 * viện khác thì chỉ tệp này đổi.
 *
 * Thư viện là native module nên **không chạy trên Expo Go** — phải build dev client bằng EAS.
 */

/** Hình dạng tối thiểu mà mã này cần ở thư viện. Khai ở đây để không kéo kiểu của thư viện ra khắp nơi. */
interface ThuVienGoogle {
  configure(o: { webClientId: string }): void;
  hasPlayServices(o?: { showPlayServicesUpdateDialog?: boolean }): Promise<boolean>;
  signIn(): Promise<unknown>;
}

/**
 * Móc `idToken` ra khỏi kết quả trả về.
 *
 * Thư viện đã đổi hình dạng kết quả giữa các phiên bản (`{idToken}` ở bản cũ, `{data:{idToken}}`
 * ở bản mới). Đọc cả hai chỗ thay vì chốt một chỗ: đoán sai thì `idToken` là `undefined`, backend
 * trả 400, và câu báo lỗi sẽ đổ lỗi cho Google trong khi lỗi nằm ở dòng này.
 */
export function docIdToken(ketQua: unknown): string | null {
  if (typeof ketQua !== 'object' || ketQua === null) return null;
  const o = ketQua as Record<string, unknown>;

  if (typeof o.idToken === 'string' && o.idToken.length > 0) return o.idToken;

  const trong = o.data;
  if (typeof trong === 'object' && trong !== null) {
    const d = trong as Record<string, unknown>;
    if (typeof d.idToken === 'string' && d.idToken.length > 0) return d.idToken;
  }

  return null;
}

/**
 * Khách bấm huỷ có phải là lỗi không.
 *
 * Ở bản 16, `signIn` KHÔNG ném khi khách huỷ — nó trả `{type: "cancelled", data: null}`, và
 * {@link docIdToken} đọc ra `null` đúng như mong muốn. Hàm này lo đường CÒN LẠI: thư viện vẫn
 * xuất mã `SIGN_IN_CANCELLED` và các thao tác khác vẫn ném nó, và bản trước đây thì chính
 * `signIn` ném. Giữ cả hai đường vì hình dạng kết quả của thư viện đã đổi một lần rồi.
 *
 * Nếu để lỗi huỷ nổi lên thì khách đổi ý một cái là ăn ngay câu báo lỗi đỏ — phạt người ta vì đã
 * đổi ý.
 */
export function laHuyBo(loi: unknown): boolean {
  if (typeof loi !== 'object' || loi === null) return false;
  const ma = (loi as Record<string, unknown>).code;
  return ma === 'SIGN_IN_CANCELLED' || ma === '-5' || ma === -5;
}

/**
 * Dựng hàm lấy token.
 *
 * Trả về `undefined` khi chưa có `webClientId` — `LoginScreen` nhận `undefined` thì KHÔNG hiện nút
 * Google. Đó là hành vi đúng: chưa cấu hình mà vẫn hiện nút thì khách bấm vào một nút không bao
 * giờ chạy.
 */
export function taoLayTokenGoogle(
  webClientId: string,
  thuVien: ThuVienGoogle,
): LayTokenGoogle | undefined {
  if (webClientId.trim().length === 0) return undefined;

  let daCauHinh = false;

  return async () => {
    if (!daCauHinh) {
      thuVien.configure({ webClientId });
      daCauHinh = true;
    }

    try {
      await thuVien.hasPlayServices({ showPlayServicesUpdateDialog: true });
      return docIdToken(await thuVien.signIn());
    } catch (loi) {
      if (laHuyBo(loi)) return null;
      throw loi;
    }
  };
}

/**
 * Bản dùng thật: nối {@link taoLayTokenGoogle} với thư viện native.
 *
 * Bọc `require` trong try/catch có chủ đích. Thư viện là native module nên **không có trên Expo
 * Go**; import tĩnh sẽ làm app chết ngay lúc mở, và cả dự án hiện vẫn chạy thử bằng Expo Go. Bắt
 * lỗi ở đây nghĩa là: có thư viện thì hiện nút Google, không có thì app vẫn chạy y như trước.
 */
export function layTokenGoogleThat(): LayTokenGoogle | undefined {
  if (GOOGLE_WEB_CLIENT_ID.trim().length === 0) return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const thuVien = require('@react-native-google-signin/google-signin') as {
      GoogleSignin: ThuVienGoogle;
    };
    return taoLayTokenGoogle(GOOGLE_WEB_CLIENT_ID, thuVien.GoogleSignin);
  } catch {
    return undefined;
  }
}
