import {
  chophepHuyMon,
  donDaXong,
  moTaBepDong,
  moTaUocLuong,
  nhanTrangThaiDon,
  nhanTrangThaiMon,
} from '../order';

describe('nhãn trạng thái đơn', () => {
  it('Ready nói rõ là CHỜ MANG RA, không phải đã xong bữa', () => {
    // Dịch thành "Hoàn tất" sẽ khiến khách tưởng có thể đứng dậy đi về.
    expect(nhanTrangThaiDon('Ready')).toBe('Nấu xong, chờ mang ra');
    expect(nhanTrangThaiDon('Ready')).not.toContain('Hoàn tất');
  });

  it('Completed mới là đã thanh toán', () => {
    expect(nhanTrangThaiDon('Completed')).toBe('Đã thanh toán');
  });

  it('phủ hết trạng thái backend có', () => {
    for (const s of [
      'Draft',
      'Placed',
      'Confirmed',
      'Preparing',
      'Ready',
      'Served',
      'Completed',
      'Cancelled',
    ]) {
      expect(nhanTrangThaiDon(s)).not.toBe(s);
    }
  });

  it('trạng thái LẠ trả nguyên văn, không nuốt thành câu chung chung', () => {
    // Backend có thể thêm trạng thái mới trước khi app kịp cập nhật. Hiện "Đang xử lý" cho mọi
    // thứ chưa biết sẽ giấu mất chuyện đó và không ai phát hiện app đã lạc hậu.
    expect(nhanTrangThaiDon('TrangThaiMoiCuaBackend')).toBe('TrangThaiMoiCuaBackend');
  });
});

describe('nhãn trạng thái món', () => {
  it('nói theo việc đã xảy ra với món, và KHỚP TỪNG CHỮ với web', () => {
    // Bộ chữ này từng phải giống hệt `ITEM_STATUS_VI` bên web
    // (`frontend/src/utils/opsStatusLabels.ts`), và bên đó có một phép kiểm y hệt: hai kho không
    // dùng chung mã được, nên ghim chuỗi ở CẢ HAI bên là cách duy nhất khiến việc trôi khỏi nhau
    // nhìn thấy được.
    //
    // Bản web đã gỡ cùng giao diện nhà hàng, nên phép kiểm này giờ đứng một mình — nó vẫn ghim
    // được chữ của app, nhưng KHÔNG còn phát hiện được việc web nói khác. Giao diện quán khi dựng
    // lại phải lấy chữ từ đây và mang theo phép kiểm của nó.
    //
    // Trước bản này hai bên đã trôi thật — cùng trạng thái `Ready`, app nói "Nấu xong", web nói
    // "Sẵn sàng phục vụ". Nhóm khách một người mở app một người quét web thấy hai câu khác nhau
    // cho cùng một món.
    expect(nhanTrangThaiMon('Pending')).toBe('Đã gửi bếp, chờ tới lượt');
    expect(nhanTrangThaiMon('Preparing')).toBe('Đang làm món của bạn');
    expect(nhanTrangThaiMon('Ready')).toBe('Món xong, đang mang ra bàn');
    expect(nhanTrangThaiMon('Served')).toBe('Đã mang ra bàn');
    expect(nhanTrangThaiMon('Cancelled')).toBe('Đã huỷ');
  });

  it('Pending ở cấp MÓN nói về BẾP, không phải về thu tiền', () => {
    // `Pending` mang ba nghĩa khác nhau trong cùng hệ thống: món chờ nấu, hoá đơn chờ tiền, thanh
    // toán chờ xác nhận. Dùng chung một hàm nhãn là cách nhanh nhất để nói sai với khách.
    expect(nhanTrangThaiMon('Pending')).toContain('bếp');
    expect(nhanTrangThaiMon('Pending')).not.toContain('thanh toán');
  });

  it('phủ hết trạng thái món', () => {
    for (const s of ['Pending', 'Preparing', 'Ready', 'Served', 'Cancelled']) {
      expect(nhanTrangThaiMon(s)).not.toBe(s);
    }
  });

  it('trạng thái món lạ cũng trả nguyên văn', () => {
    expect(nhanTrangThaiMon('MonLa')).toBe('MonLa');
  });
});

describe('đơn đã xong chưa', () => {
  it('Completed và Cancelled là xong', () => {
    expect(donDaXong('Completed')).toBe(true);
    expect(donDaXong('Cancelled')).toBe(true);
  });

  it('Served CHƯA xong — món đã ra bàn nhưng chưa trả tiền', () => {
    expect(donDaXong('Served')).toBe(false);
    expect(donDaXong('Ready')).toBe(false);
  });
});

describe('ước lượng thời gian (hạn chế #10)', () => {
  it('KHÔNG có ước lượng thì trả null — app không được bịa con số', () => {
    // Ba điều kiện của #10 (không đoán bừa, luôn là khoảng, có tính tải bếp) vẫn giữ nguyên qua
    // lần viết lại ở #141. Một con số bịa ở tầng app phá cả ba mà không ai thấy.
    expect(moTaUocLuong(null, null)).toBeNull();
    expect(moTaUocLuong(10, null)).toBeNull();
    expect(moTaUocLuong(null, 20)).toBeNull();
  });

  it('có ước lượng thì hiện dạng KHOẢNG, không phải một con số', () => {
    expect(moTaUocLuong(15, 25)).toBe('15–25 phút');
  });

  it('khoảng suy biến (low >= high) vẫn nói rõ là "khoảng"', () => {
    // Một con số trần trụi hứa nhiều hơn thứ hệ thống biết.
    expect(moTaUocLuong(12, 12)).toBe('khoảng 12 phút');
    expect(moTaUocLuong(12, 10)).toBe('khoảng 12 phút');
  });
});

describe('báo bếp đang đông', () => {
  it('bếp bình thường thì KHÔNG nói gì', () => {
    expect(moTaBepDong(false, '15–25 phút')).toBeNull();
  });

  it('bếp đông thì nói RÕ VÌ SAO lâu', () => {
    // Ước lượng nhảy từ 15–25 lên 42–57 phút mà không nói vì sao trông như app tính sai.
    expect(moTaBepDong(true, '42–57 phút')).toContain('Bếp đang đông');
  });

  it('KHÔNG báo bếp đông khi chưa có ước lượng', () => {
    // Báo "bếp đang đông" mà không kèm con số nào là gieo lo lắng mà không cho khách thứ gì để
    // quyết định.
    expect(moTaBepDong(true, null)).toBeNull();
  });
});

describe('huỷ món (hạn chế #11)', () => {
  it('CHỈ huỷ được món đang Pending', () => {
    // Nhân viên vẫn huỷ được món Preparing, khách thì không — tới lúc đó bếp đã dùng nguyên liệu.
    expect(chophepHuyMon('Pending', true)).toBe(true);
    expect(chophepHuyMon('Preparing', true)).toBe(false);
    expect(chophepHuyMon('Ready', true)).toBe(false);
    expect(chophepHuyMon('Served', true)).toBe(false);
    expect(chophepHuyMon('Cancelled', true)).toBe(false);
  });

  it('KHÔNG có token của đơn thì không huỷ được, dù món đang Pending', () => {
    // Đơn do máy khác trong bàn đặt thì máy này không có token — và đó là đúng: người đặt mới là
    // người quyết định huỷ.
    expect(chophepHuyMon('Pending', false)).toBe(false);
  });
});
