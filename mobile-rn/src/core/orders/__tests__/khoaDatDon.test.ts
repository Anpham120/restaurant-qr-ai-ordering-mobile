import { KhoaDatDon, khoaHopLe, sinhKhoaNgauNhien } from '../khoaDatDon';

/** Nguồn ngẫu nhiên đếm được, để test không phụ thuộc may rủi. */
function nguonDem() {
  let n = 0;
  return () => `ord.gia-lap-${++n}`;
}

describe('khoá gắn với NỘI DUNG giỏ, không gắn với lần bấm', () => {
  it('giỏ không đổi thì gửi lại bao nhiêu lần cũng CÙNG một khoá', () => {
    // Đây đúng là tình huống Idempotency-Key sinh ra để chặn: mạng chập chờn, khách bấm lại. Sinh
    // khoá mới lúc gửi lại là vô hiệu hoá nó trong khi vẫn gửi header cho có.
    const k = new KhoaDatDon(nguonDem());

    expect(k.khoaCho('m1:2')).toBe(k.khoaCho('m1:2'));
    expect(k.khoaCho('m1:2')).toBe(k.khoaCho('m1:2'));
  });

  it('giỏ đổi thì khoá ĐỔI', () => {
    // Giữ nguyên khoá sau khi giỏ đổi thì khách thêm một món rồi bấm đặt và nhận 409 khó hiểu.
    const k = new KhoaDatDon(nguonDem());

    expect(k.khoaCho('m1:2')).not.toBe(k.khoaCho('m1:3'));
  });

  it('quen() rồi thì lần đặt sau có khoá mới, kể cả giỏ trùng nội dung', () => {
    // Khách gọi thêm đúng món cũ là chuyện rất thường. Không quên khoá thì backend trả về chính
    // đơn cũ — khách thấy "thành công" mà bếp không nhận gì thêm.
    const k = new KhoaDatDon(nguonDem());
    const dau = k.khoaCho('m1:2');

    k.quen();

    expect(k.khoaCho('m1:2')).not.toBe(dau);
  });

  it('quay lại giỏ CŨ trong cùng một lần đặt thì sinh khoá mới, không dùng lại khoá cũ', () => {
    // Ca này KHÔNG có ở bản Flutter. Khách thêm món rồi bớt lại là luồng bình thường, và lớp này
    // chỉ nhớ MỘT dấu vết — nên quay về giỏ cũ cho ra khoá mới. Điều đó ĐÚNG: backend chỉ từ chối
    // khi CÙNG khoá đi với nội dung KHÁC, còn khoá mới cho nội dung cũ chỉ tạo một đơn mới, đúng
    // ý khách vừa bấm đặt.
    const k = new KhoaDatDon(nguonDem());
    const dau = k.khoaCho('m1:2');
    k.khoaCho('m1:3');

    expect(k.khoaCho('m1:2')).not.toBe(dau);
  });
});

describe('khoá hợp lệ với backend', () => {
  it('khoá sinh ra khớp đúng mẫu backend cho phép và không quá 100 ký tự', () => {
    // Một khoá lọt ký tự lạ bị trả 400 IDEMPOTENCY_KEY_INVALID và khách không đặt được món nào
    // cả, trong khi mã app trông vẫn đúng.
    for (let i = 0; i < 50; i++) {
      expect(khoaHopLe(sinhKhoaNgauNhien())).toBe(true);
    }
  });

  it('nhận diện khoá KHÔNG hợp lệ', () => {
    expect(khoaHopLe('')).toBe(false);
    expect(khoaHopLe('có dấu cách')).toBe(false);
    expect(khoaHopLe('khoá/có/gạch-chéo')).toBe(false);
    expect(khoaHopLe('a'.repeat(101))).toBe(false);
  });

  it('khoá dài đúng 100 ký tự vẫn hợp lệ', () => {
    expect(khoaHopLe('a'.repeat(100))).toBe(true);
  });

  it('hai lần sinh cho hai khoá khác nhau', () => {
    const bo = new Set<string>();
    for (let i = 0; i < 200; i++) bo.add(sinhKhoaNgauNhien());

    // 200 lần sinh mà trùng nhau thì nguồn ngẫu nhiên hỏng, và hậu quả là hai đơn khác nhau dùng
    // chung một khoá — backend trả 409 cho đơn thứ hai.
    expect(bo.size).toBe(200);
  });
});
