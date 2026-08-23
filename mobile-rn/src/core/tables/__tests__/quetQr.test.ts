import { phanTichQrBan } from '../quetQr';

describe('mã QR thật do web sinh ra', () => {
  it('lấy được CẢ token lẫn mã bàn', () => {
    // Dạng chính xác từ AdminTableService.buildCustomerPath.
    const kq = phanTichQrBan('https://order.cmcrestaurant.app/table/T01?qr=cmc-table-t01-qr');

    expect(kq?.qrToken).toBe('cmc-table-t01-qr');
    expect(kq?.tableCode).toBe('T01');
  });

  it('KHÔNG lấy nguyên chuỗi URL làm token', () => {
    // Đây là lỗi dễ mắc nhất khi viết bộ quét: gửi cả URL lên máy chủ và nhận QR_NOT_FOUND cho
    // một mã QR hoàn toàn hợp lệ.
    const kq = phanTichQrBan('https://order.example.com/table/T05?qr=abc-123');

    expect(kq?.qrToken).toBe('abc-123');
    expect(kq?.qrToken.startsWith('http')).toBe(false);
  });

  it('giải mã mã bàn có ký tự đã escape', () => {
    expect(phanTichQrBan('https://o.example.com/table/Ban%2001?qr=tok-1')?.tableCode).toBe(
      'Ban 01',
    );
  });

  it('lấy đoạn NGAY SAU "table", không phải đoạn cuối', () => {
    // Đường dẫn dài thêm một ngày nào đó thì đoạn cuối không còn là mã bàn.
    expect(phanTichQrBan('https://o.example.com/vi/table/T09/menu?qr=tok-9')?.tableCode).toBe(
      'T09',
    );
  });

  it('URL http cũng nhận, không chỉ https', () => {
    // Máy chủ chạy trong LAN của quán thường không có TLS.
    expect(phanTichQrBan('http://192.168.1.5:8080/table/T02?qr=tok-2')?.qrToken).toBe('tok-2');
  });

  it('token có ký tự đã escape trong ?qr= được giải mã', () => {
    // Ca này KHÔNG có ở bản Flutter. `Uri.queryParameters` của Dart tự giải mã; `URLSearchParams`
    // cũng vậy — nhưng nếu ai đó "đơn giản hoá" bằng cách tự cắt chuỗi sau "qr=" thì token sẽ
    // mang theo %2D và máy chủ trả QR_NOT_FOUND cho một mã hợp lệ.
    expect(phanTichQrBan('https://o.example.com/table/T01?qr=tok%2D1')?.qrToken).toBe('tok-1');
  });
});

describe('token trần', () => {
  it('nhận mã in kiểu cũ, không kèm URL', () => {
    // Ô nhập tay trong app dùng đúng dạng này.
    const kq = phanTichQrBan('cmc-table-t01-qr');

    expect(kq?.qrToken).toBe('cmc-table-t01-qr');
    expect(kq?.tableCode).toBeNull();
  });
});

describe('từ chối thứ không phải QR của bàn', () => {
  it('URL thiếu ?qr= thì trả null', () => {
    // Thiếu đúng thứ bắt buộc. Đoán ở đây nghĩa là gửi token sai lên máy chủ.
    expect(phanTichQrBan('https://order.example.com/table/T01')).toBeNull();
  });

  it('QR wifi, danh thiếp, link ví — đều bị từ chối', () => {
    // Không lọc thì mọi mã QR khác trên đời đều được gửi lên máy chủ như một token.
    expect(phanTichQrBan('WIFI:S:QuynhTrang;T:WPA;P:12345678;;')).toBeNull();
    expect(phanTichQrBan('BEGIN:VCARD\nFN:Nguyen Van A\nEND:VCARD')).toBeNull();
    // Chuỗi số dài vẫn hợp dạng token — máy chủ sẽ từ chối, đó là nơi đúng để chặn.
    expect(phanTichQrBan('00020101021138540010A00000072701')).not.toBeNull();
  });

  it('rỗng, khoảng trắng, quá ngắn đều trả null', () => {
    expect(phanTichQrBan(null)).toBeNull();
    expect(phanTichQrBan('')).toBeNull();
    expect(phanTichQrBan('   ')).toBeNull();
    expect(phanTichQrBan('abc')).toBeNull();
  });

  it('chuỗi có khoảng trắng không phải token', () => {
    expect(phanTichQrBan('ban so 1')).toBeNull();
  });

  it('URL scheme khác http/https không được coi là URL', () => {
    // Ca này KHÔNG có ở bản Flutter nhưng cần ở JavaScript: `new URL` nhận mọi scheme, kể cả
    // `javascript:` và `mailto:`. Nếu chỉ hỏi "phân tích được không" thay vì hỏi scheme, một mã
    // QR chứa `javascript:alert(1)?qr=x` sẽ lọt vào nhánh URL.
    expect(phanTichQrBan('mailto:a@b.com?qr=tok-1')).toBeNull();
    expect(phanTichQrBan('javascript:alert(1)?qr=tok-1')).toBeNull();
  });
});
