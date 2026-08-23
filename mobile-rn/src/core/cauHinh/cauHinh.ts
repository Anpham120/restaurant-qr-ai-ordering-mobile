/**
 * Địa chỉ máy chủ mà app đang trỏ tới.
 *
 * Vì sao phải sửa được LÚC CHẠY thay vì chỉ đặt biến môi trường lúc dựng:
 *
 * Biến lúc dựng là **compile-time**. Một bản dựng ở CI mang sẵn `10.0.2.2:8081`, và địa chỉ đó
 * chỉ tồn tại **bên trong máy ảo Android** — cắm bản ấy vào điện thoại thật thì nó gọi vào hư
 * không. Muốn mỗi lần đổi mạng lại dựng một bản riêng thì phải có máy dựng được, thứ mà máy phát
 * triển của dự án này không có.
 *
 * Nên một bản dựng duy nhất + màn hình nhập địa chỉ là cách duy nhất để §9.10 ("kiểm thử trên
 * thiết bị thật, chụp bằng chứng ở mỗi pha") thực hiện được.
 */
export interface CauHinhMayChu {
  readonly apiBaseUrl: string;
  readonly imageBaseUrl: string;
}

export function cauHinhTuJson(json: unknown): CauHinhMayChu {
  const o = (json ?? {}) as Record<string, unknown>;
  return {
    apiBaseUrl: typeof o.apiBaseUrl === 'string' ? o.apiBaseUrl : '',
    imageBaseUrl: typeof o.imageBaseUrl === 'string' ? o.imageBaseUrl : '',
  };
}

/**
 * Chuẩn hoá thứ người dùng gõ thành một URL dùng được, hoặc `null` nếu không hiểu được.
 *
 * Người gõ trên bàn phím điện thoại sẽ gõ `192.168.1.5`, không gõ `http://192.168.1.5:8081/`.
 * Bắt họ gõ đủ là bắt họ gõ đúng ba thứ dễ sai trên một bàn phím nhỏ.
 *
 * Luật:
 * - thiếu scheme → thêm `http://` (mạng LAN trong quán không có TLS);
 * - thiếu cổng → thêm `congMacDinh`;
 * - cắt dấu `/` thừa ở cuối để việc ghép đường dẫn về sau không sinh ra `//`.
 */
export function chuanHoaDiaChi(nhapVao: string, congMacDinh: number): string | null {
  let s = nhapVao.trim();
  if (s.length === 0) return null;

  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = `http://${s}`;
  }

  let uri: URL;
  try {
    uri = new URL(s);
  } catch {
    return null;
  }
  if (uri.hostname.length === 0) return null;

  // Chặn thứ người dùng dễ dán nhầm: một đường dẫn đầy đủ tới endpoint chứ không phải địa chỉ gốc.
  // Nhận nó sẽ tạo ra "/api/menu/api/menu" và mọi lời gọi hỏng với lỗi khó hiểu.
  if (uri.pathname !== '' && uri.pathname !== '/') return null;

  // `URL.port` bỏ trống với cổng mặc định của scheme, nên `example.com:80` sẽ trông như không có
  // cổng và bị gán nhầm cổng mặc định của app. Đọc thẳng từ chuỗi để giữ đúng thứ người dùng gõ.
  const congGoTay = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*?:(\d+)(?:[/?#]|$)/i.exec(s);
  const cong = congGoTay?.[1] ?? (uri.port !== '' ? uri.port : String(congMacDinh));

  return `${uri.protocol}//${uri.hostname}:${cong}`;
}

/**
 * Đoán địa chỉ ẢNH từ địa chỉ API.
 *
 * Ảnh do container web phục vụ ở cổng 8080, API ở 8081 — cùng máy. Đo thật: `:8081/menu-images`
 * trả 401, `:8080/menu-images` trả 200. Đoán giúp để người dùng chỉ phải gõ MỘT địa chỉ; vẫn sửa
 * được nếu triển khai khác.
 */
export function suyRaDiaChiAnh(apiBaseUrl: string, congAnh = 8080): string {
  try {
    const uri = new URL(apiBaseUrl);
    if (uri.hostname.length === 0) return apiBaseUrl;
    return `${uri.protocol}//${uri.hostname}:${congAnh}`;
  } catch {
    // Địa chỉ hỏng thì trả nguyên vào, không nổ: nơi gọi đang dựng giao diện, và một ngoại lệ ở
    // đây làm trắng màn hình vì một chuỗi cấu hình sai.
    return apiBaseUrl;
  }
}
