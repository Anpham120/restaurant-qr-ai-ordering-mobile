/** Người dùng trả về kèm token. Ánh xạ đúng `AuthDtos.AuthUserResponse` của backend Java. */
export interface AuthUser {
  readonly userId: string;
  readonly fullName: string;
  /**
   * `null` với tài khoản tạo bằng số điện thoại — loại tài khoản đó KHÔNG có email.
   *
   * V22 đã cho `users.email` nhận NULL vì lý do này: nhân viên vẫn dùng email, khách thì không.
   * Khai `string` ở đây là nói dối về dữ liệu backend thật sự trả về, và chỗ nào ghép chuỗi sẽ
   * lặng lẽ in ra "null" hoặc để trống.
   */
  readonly email: string | null;
  readonly role: string;
}

/**
 * Chuỗi nhận diện người dùng để hiển thị.
 *
 * Không dùng thẳng `email`: tài khoản tạo bằng số điện thoại không có email, và React vẽ `null`
 * thành khoảng trắng — màn hồ sơ hiện ra một dòng trống ở đúng chỗ lẽ ra nói "bạn là ai".
 *
 * Lùi về họ tên chứ không lùi về số điện thoại vì `AuthUserResponse` của backend KHÔNG mang số.
 */
export function danhTinh(user: AuthUser): string {
  const email = user.email;
  if (email !== null && email.trim().length > 0) return email;
  return user.fullName;
}

/** Phiên đăng nhập đã lưu trên máy: token, hạn dùng, và người dùng. */
export interface AuthSession {
  readonly accessToken: string;
  /**
   * Luôn giữ ở **UTC**, dạng ISO-8601. Backend trả `Instant` với hậu tố `Z`; nếu để giờ máy thì
   * một thiết bị đặt sai múi giờ sẽ tự cho là token còn hạn hoặc đã hết hạn sớm vài tiếng.
   */
  readonly expiresAt: string;
  readonly user: AuthUser;
}

/**
 * Khoảng lùi trước hạn, tính bằng mili giây.
 *
 * Token còn đúng 20 giây không dùng được: request bay đi, mạng 3G trong quán mất 2–3 giây, tới
 * nơi thì token đã chết và người dùng nhận 401 giữa lúc đang đặt món. Coi như hết hạn sớm hơn
 * một phút để phần gọi mạng luôn có token thật sự còn sống.
 */
export const BIEN_AN_TOAN_MS = 60_000;

export function conHieuLuc(session: AuthSession, bayGio: Date): boolean {
  const han = Date.parse(session.expiresAt);
  if (Number.isNaN(han)) return false;
  return han - BIEN_AN_TOAN_MS > bayGio.getTime();
}

export function authUserTuJson(json: unknown): AuthUser {
  const o = json as Record<string, unknown>;
  return {
    userId: o.userId as string,
    fullName: o.fullName as string,
    // Ép kiểu thẳng như các trường khác sẽ cho ra `undefined` chứ không phải `null` khi backend
    // bỏ trường này — và `undefined` lọt qua mọi phép so với `null`.
    email: typeof o.email === 'string' ? o.email : null,
    role: o.role as string,
  };
}

export function authSessionTuJson(json: unknown): AuthSession {
  const o = json as Record<string, unknown>;
  const han = new Date(o.expiresAt as string);
  if (Number.isNaN(han.getTime())) throw new Error('expiresAt không đọc được');
  return {
    accessToken: o.accessToken as string,
    expiresAt: han.toISOString(),
    user: authUserTuJson(o.user),
  };
}

/**
 * KHÔNG in token ra.
 *
 * Object bị đưa vào chuỗi ở những chỗ không ai ngờ: `console.log(session)` lúc gỡ lỗi, log của
 * React Native khi component ném lỗi, và báo cáo sự cố gửi lên dịch vụ ngoài. Khác với Dart, mặc
 * định của JavaScript là in HẾT mọi trường — tức token lộ ngay từ lần `console.log` đầu tiên.
 * Nên ở đây phải có một hàm mô tả có ích để không ai phải log nguyên object.
 */
export function moTaSession(session: AuthSession): string {
  return `AuthSession(user: ${danhTinh(session.user)}, role: ${session.user.role}, expiresAt: ${session.expiresAt})`;
}
