import { huongDanChoXacNhan, invoiceTuJson, nhanTrangThaiHoaDon } from '../invoice';

describe('nhãn trạng thái hoá đơn', () => {
  it('Pending của HOÁ ĐƠN là chờ xác nhận, không phải chờ nấu', () => {
    // Ba nghĩa của cùng một chữ trong cùng một hệ thống: món Pending là chờ nấu, hoá đơn Pending
    // là chờ tiền. Dùng chung một hàm nhãn là cách nhanh nhất để nói sai với khách.
    expect(nhanTrangThaiHoaDon('Pending')).toBe('Đang chờ xác nhận');
    expect(nhanTrangThaiHoaDon('Pending')).not.toContain('nấu');
  });

  it('phủ hết trạng thái hoá đơn', () => {
    for (const s of ['NotRequested', 'Pending', 'Paid', 'Confirmed', 'Cancelled']) {
      expect(nhanTrangThaiHoaDon(s)).not.toBe(s);
    }
  });

  it('hoá đơn đã tất toán nói "Đã thanh toán", dù máy chủ gọi tên nào', () => {
    // LỖI CÓ THẬT. Máy chủ chốt hoá đơn BÀN bằng `Confirmed`, không phải `Paid` — đo trên
    // production:
    //
    //     GET /api/table-sessions/{id}/invoice  ->  {"status":"Confirmed", ...}
    //
    // App chỉ biết `Paid`, nên rơi vào nhánh mặc định và trả về nguyên chữ tiếng Anh: khách vừa
    // chuyển khoản xong nhìn thấy "Confirmed" giữa màn hình tiếng Việt. Web đã xử lý cả hai từ
    // lâu (`AdminOrderManager`, `VietQrPaymentModal`); app thì chưa.
    expect(nhanTrangThaiHoaDon('Confirmed')).toBe('Đã thanh toán');
    expect(nhanTrangThaiHoaDon('Paid')).toBe('Đã thanh toán');
  });

  it('trạng thái lạ trả nguyên văn', () => {
    expect(nhanTrangThaiHoaDon('TrangThaiMoi')).toBe('TrangThaiMoi');
  });
});

describe('hướng dẫn chờ xác nhận', () => {
  it('COD chỉ tới QUẦY, không hứa app tự xác nhận', () => {
    // Khách KHÔNG tự xác nhận được: POST .../payment/confirm bằng token bàn trả 401. Một nút
    // "Tôi đã trả" sẽ không làm gì, và khách bấm rồi tưởng xong.
    const s = huongDanChoXacNhan('COD');
    expect(s).toContain('quầy');
    expect(s).toContain('Nhân viên xác nhận');
  });

  it('VietQR NHẤN MẠNH giữ nguyên nội dung chuyển khoản', () => {
    // Webhook Casso đối soát bằng đúng chuỗi đó. Sửa một ký tự là tiền về mà hệ thống không nhận
    // ra, và hoá đơn nằm chờ cho tới khi có người xử lý tay.
    expect(huongDanChoXacNhan('VietQR')).toContain('GIỮ NGUYÊN');
  });

  it('chưa chọn phương thức thì bảo chọn, không nói gì về tiền', () => {
    expect(huongDanChoXacNhan('Unselected')).toBe('Chọn cách thanh toán để tiếp tục.');
  });
});

describe('đọc hoá đơn từ JSON', () => {
  it('thiếu trường thì có mặc định an toàn, không phải undefined', () => {
    const hd = invoiceTuJson({});

    expect(hd.status).toBe('NotRequested');
    expect(hd.method).toBe('Unselected');
    expect(hd.totalAmount).toBe(0);
    expect(hd.items).toEqual([]);
    expect(hd.vietQr).toBeNull();
  });

  it('vietQr null khi phương thức không phải chuyển khoản', () => {
    expect(invoiceTuJson({ method: 'COD', vietQr: null }).vietQr).toBeNull();
  });

  it('giữ nguyên nội dung chuyển khoản, không cắt không sửa', () => {
    const hd = invoiceTuJson({
      method: 'VietQR',
      vietQr: { amount: 120000, transferContent: 'VIAN TS0042', quickLink: null },
    });

    expect(hd.vietQr?.transferContent).toBe('VIAN TS0042');
    expect(hd.vietQr?.amount).toBe(120000);
    expect(hd.vietQr?.qrImageDataUri).toBeNull();
  });
});
