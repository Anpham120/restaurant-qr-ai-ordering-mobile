import * as SecureStore from 'expo-secure-store';

/**
 * Kho khoá–giá trị trên thiết bị.
 *
 * Tách thành interface để phần QUYẾT ĐỊNH (dữ liệu hỏng thì xoá, phiên hết hạn thì xoá) kiểm được
 * mà không cần thiết bị thật: `expo-secure-store` nói chuyện với Keychain (iOS) và Keystore
 * (Android) qua tầng native, thứ không tồn tại trong `jest`.
 */
export interface KhoAnToan {
  doc(khoa: string): Promise<string | null>;
  ghi(khoa: string, giaTri: string): Promise<void>;
  xoa(khoa: string): Promise<void>;
}

/**
 * Bản cất thật trên thiết bị.
 *
 * Vì sao KHÔNG dùng `AsyncStorage`: nó là file thường. Trên máy đã root, hoặc qua `adb backup` ở
 * app cho phép sao lưu, token đọc được bằng mắt. JWT ở đây là thứ thay được cả mật khẩu cho tới
 * lúc hết hạn.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, không phải `WHEN_UNLOCKED`. Mặc định của Keychain cho phép
 * mục dữ liệu đi theo bản sao lưu iCloud và sống lại trên MÁY KHÁC. Token của quán ăn không có lý
 * do gì để tồn tại trên một thiết bị mà khách chưa từng đăng nhập.
 */
export const khoThietBi: KhoAnToan = {
  doc: (khoa) => SecureStore.getItemAsync(khoa),
  ghi: (khoa, giaTri) =>
    SecureStore.setItemAsync(khoa, giaTri, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  xoa: (khoa) => SecureStore.deleteItemAsync(khoa),
};

/** Kho trong bộ nhớ, cho test. Không dùng trong app thật. */
export function khoTrongBoNho(banDau: Record<string, string> = {}): KhoAnToan {
  const bo = new Map<string, string>(Object.entries(banDau));
  return {
    doc: async (khoa) => bo.get(khoa) ?? null,
    ghi: async (khoa, giaTri) => {
      bo.set(khoa, giaTri);
    },
    xoa: async (khoa) => {
      bo.delete(khoa);
    },
  };
}
