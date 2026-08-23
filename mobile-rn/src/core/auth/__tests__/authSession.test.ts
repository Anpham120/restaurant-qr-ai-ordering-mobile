import { BIEN_AN_TOAN_MS, authSessionTuJson, conHieuLuc, moTaSession } from '../authSession';

const NGUOI = { userId: 'u1', fullName: 'Khách', email: 'k@local.test', role: 'Customer' };

function phien(expiresAt: string) {
  return { accessToken: 'tok.abc.123', expiresAt, user: NGUOI };
}

describe('còn hiệu lực', () => {
  const bayGio = new Date('2026-08-23T10:00:00Z');

  it('token còn xa hạn thì dùng được', () => {
    expect(conHieuLuc(phien('2026-08-23T11:00:00Z'), bayGio)).toBe(true);
  });

  it('token đã quá hạn thì không', () => {
    expect(conHieuLuc(phien('2026-08-23T09:59:00Z'), bayGio)).toBe(false);
  });

  it('token còn 30 giây bị coi như đã hết hạn', () => {
    // Request bay đi, mạng 3G trong quán mất 2–3 giây, tới nơi thì token đã chết và người dùng
    // nhận 401 giữa lúc đang đặt món.
    expect(conHieuLuc(phien('2026-08-23T10:00:30Z'), bayGio)).toBe(false);
  });

  it('đúng mép biên an toàn thì chưa dùng được', () => {
    const mep = new Date(bayGio.getTime() + BIEN_AN_TOAN_MS).toISOString();
    expect(conHieuLuc(phien(mep), bayGio)).toBe(false);
  });

  it('hạn không đọc được thì coi như hết hạn, không coi như còn', () => {
    // Fail closed. Đọc nhầm theo hướng "còn hạn" khiến app gửi token chết và nhận 401 ở một chỗ
    // ngẫu nhiên; đọc theo hướng "hết hạn" chỉ bắt đăng nhập lại.
    expect(conHieuLuc(phien('không-phải-ngày'), bayGio)).toBe(false);
  });
});

describe('đọc từ JSON', () => {
  it('giờ địa phương được quy về UTC', () => {
    // Backend trả Instant có hậu tố Z. Nếu giữ theo giờ máy thì một thiết bị đặt sai múi giờ sẽ
    // tự cho là token còn hạn hoặc đã hết hạn sớm vài tiếng.
    const s = authSessionTuJson({
      accessToken: 't',
      expiresAt: '2026-08-23T17:00:00+07:00',
      user: NGUOI,
    });
    expect(s.expiresAt).toBe('2026-08-23T10:00:00.000Z');
  });

  it('hạn hỏng thì NÉM, để nơi gọi xoá phiên thay vì giữ một phiên vô nghĩa', () => {
    expect(() => authSessionTuJson({ accessToken: 't', expiresAt: 'rác', user: NGUOI })).toThrow();
  });
});

describe('mô tả phiên', () => {
  it('KHÔNG chứa token', () => {
    // Khác với Dart, mặc định của JavaScript là in HẾT mọi trường, nên token lộ ngay từ lần
    // console.log đầu tiên. Hàm này tồn tại để không ai phải log nguyên object.
    const mo = moTaSession(phien('2026-08-23T11:00:00Z'));
    expect(mo).not.toContain('tok.abc.123');
    expect(mo).toContain('k@local.test');
  });
});
