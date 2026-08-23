/**
 * Hình dạng tối thiểu của một phản hồi HTTP mà app cần.
 *
 * Hẹp hơn `Response` thật để test viết được bản giả trong vài dòng, và để chỗ nào lỡ dùng tới
 * phần còn lại của `Response` thì hỏng ngay lúc kiểm kiểu chứ không phải lúc chạy trên máy thật.
 */
export interface PhanHoi {
  readonly status: number;
  text(): Promise<string>;
}

export type GoiMang = (url: string, init?: RequestInit) => Promise<PhanHoi>;

export const goiMangThat: GoiMang = (url, init) => fetch(url, init);

/**
 * Header cho thân JSON.
 *
 * Ghi rõ `charset=utf-8` thay vì để trống. Spring mặc định coi `application/json` là UTF-8 nên
 * để trống vẫn chạy, nhưng đã có một lần đo thật trên dự án này cho ra
 * `JSON parse error: Invalid UTF-8 middle byte` vì thiếu nó — và thông báo đó không dẫn về
 * nguyên nhân. Tên tiếng Việt có dấu đi qua đường này ở mọi màn hình.
 */
export const HEADER_JSON = { 'Content-Type': 'application/json; charset=utf-8' } as const;

/**
 * Đọc mã lỗi từ thân `{"error":{"code":..,"message":..}}` của backend.
 *
 * Trả `null` khi thân không phải JSON — chuyện có thật khi reverse proxy chết và trả HTML 502.
 * Nếu để `JSON.parse` ném ra mà không ai bắt, người dùng thấy màn hình đỏ thay vì một câu đọc
 * được.
 */
export function maLoi(than: string): string | null {
  try {
    const body: unknown = JSON.parse(than);
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const loi = (body as { error: unknown }).error;
      if (typeof loi === 'object' && loi !== null && 'code' in loi) {
        const code = (loi as { code: unknown }).code;
        return code == null ? null : String(code);
      }
    }
  } catch {
    // Rơi xuống nhánh theo mã HTTP ở nơi gọi.
  }
  return null;
}

/**
 * Đuôi chung của mọi bảng dịch lỗi: 5xx thành một câu, còn lại giữ mã và kèm số HTTP.
 *
 * Tách ra khi có bản sao thứ ba, không sớm hơn. Mỗi API vẫn tự giữ bảng dịch RIÊNG của mình —
 * đó mới là phần mang nghĩa nghiệp vụ, và gộp chúng lại sẽ tạo ra một bảng khổng lồ nơi mã của
 * giỏ hàng lẫn với mã của đăng nhập.
 *
 * @param moTa câu mô tả việc đang làm, ví dụ "Không cập nhật được giỏ"
 */
export function loiChungHttp(
  status: number,
  code: string | null,
  moTa: string,
): { code: string; message: string } {
  if (status >= 500) {
    return { code: 'SERVER_ERROR', message: 'Máy chủ đang lỗi. Thử lại sau ít phút.' };
  }
  return { code: code ?? 'UNKNOWN', message: `${moTa} (mã ${status}).` };
}
