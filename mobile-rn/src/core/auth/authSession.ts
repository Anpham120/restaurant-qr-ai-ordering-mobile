/** Người dùng trả về kèm token. Ánh xạ đúng `AuthDtos.AuthUserResponse` của backend Java. */
export interface AuthUser {
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly role: string;
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
    email: o.email as string,
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
  return `AuthSession(user: ${session.user.email}, role: ${session.user.role}, expiresAt: ${session.expiresAt})`;
}
