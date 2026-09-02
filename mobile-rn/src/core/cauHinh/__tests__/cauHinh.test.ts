import { chuanHoaDiaChi, suyRaDiaChiAnh } from '../cauHinh';

describe('chuẩn hoá địa chỉ người dùng gõ', () => {
  it('chỉ gõ IP thì thêm scheme và cổng mặc định', () => {
    // Người gõ trên bàn phím điện thoại sẽ gõ đúng thế này. Bắt họ gõ đủ
    // "http://192.168.1.5:8081" là bắt gõ đúng ba thứ dễ sai trên bàn phím nhỏ.
    expect(chuanHoaDiaChi('192.168.1.5', 8081)).toBe('http://192.168.1.5:8081');
  });

  it('gõ kèm cổng thì GIỮ cổng đó', () => {
    expect(chuanHoaDiaChi('192.168.1.5:9000', 8081)).toBe('http://192.168.1.5:9000');
  });

  it('gõ đủ URL thì giữ nguyên', () => {
    expect(chuanHoaDiaChi('http://10.0.2.2:8081', 8081)).toBe('http://10.0.2.2:8081');
  });

  it('https được giữ, không ép về http', () => {
    expect(chuanHoaDiaChi('https://quan.example.com', 8081)).toBe('https://quan.example.com:8081');
  });

  it('cắt dấu / thừa ở cuối', () => {
    // Không cắt thì mọi đường dẫn ghép sau này thành "//api/menu".
    expect(chuanHoaDiaChi('192.168.1.5:8081/', 8081)).toBe('http://192.168.1.5:8081');
  });

  it('TỪ CHỐI đường dẫn đầy đủ tới endpoint', () => {
    // Người dùng rất dễ dán nguyên "http://192.168.1.5:8081/api/menu" từ trình duyệt. Nhận nó sẽ
    // tạo ra "/api/menu/api/menu" và mọi lời gọi hỏng với lỗi khó hiểu.
    expect(chuanHoaDiaChi('http://192.168.1.5:8081/api/menu', 8081)).toBeNull();
  });

  it('rỗng hoặc rác thì trả null', () => {
    expect(chuanHoaDiaChi('', 8081)).toBeNull();
    expect(chuanHoaDiaChi('   ', 8081)).toBeNull();
    expect(chuanHoaDiaChi('http://', 8081)).toBeNull();
  });

  it('cổng gõ tay trùng cổng mặc định của scheme vẫn được giữ', () => {
    // Ca này KHÔNG có ở bản Flutter vì Dart giữ nguyên cổng gõ tay. `URL` của JavaScript thì bỏ
    // trống `.port` với cổng mặc định của scheme, nên nếu chỉ đọc `.port` thì "example.com:80"
    // sẽ bị gán nhầm cổng 8081 — tức app gọi sai máy chủ mà người dùng gõ đúng.
    expect(chuanHoaDiaChi('http://quan.example.com:80', 8081)).toBe('http://quan.example.com:80');
    expect(chuanHoaDiaChi('https://quan.example.com:443', 8081)).toBe(
      'https://quan.example.com:443',
    );
  });
});

describe('suy ra địa chỉ ảnh', () => {
  it('cùng máy, đổi sang cổng 8080', () => {
    // Ảnh do container web phục vụ ở 8080, API ở 8081 — đo thật: :8081/menu-images → 401,
    // :8080/menu-images → 200.
    expect(suyRaDiaChiAnh('http://192.168.1.5:8081')).toBe('http://192.168.1.5:8080');
  });

  it('giữ scheme https', () => {
    expect(suyRaDiaChiAnh('https://quan.example.com:8081')).toBe('https://quan.example.com:8080');
  });

  it('địa chỉ KHÔNG có cổng thì đổi api. thành order., KHÔNG gắn 8080', () => {
    // LỖI CÓ THẬT. Bản triển khai đứng sau nginx chỉ mở 80/443; 8080 là cổng nội bộ của container.
    // Gắn nó vào cho ra một địa chỉ không tới được, và app im lặng không tải được ảnh món nào.
    //
    // Đo trên máy chủ thật:
    //   https://api.cmcrestaurant.app:8080/menu-images/…  -> không kết nối được
    //   https://api.cmcrestaurant.app/menu-images/…       -> 401 (miền API)
    //   https://order.cmcrestaurant.app/menu-images/…      -> 200 image/webp
    expect(suyRaDiaChiAnh('https://api.cmcrestaurant.app/api')).toBe(
      'https://order.cmcrestaurant.app',
    );
  });

  it('miền staging dùng dấu gạch nối thay vì dấu chấm', () => {
    // `api-staging.` chứ không phải `api.staging.` — quy ước tên miền của dự án.
    expect(suyRaDiaChiAnh('https://api-staging.cmcrestaurant.app/api')).toBe(
      'https://order-staging.cmcrestaurant.app',
    );
  });

  it('không có tiền tố api thì giữ nguyên host', () => {
    expect(suyRaDiaChiAnh('https://quan.example.com/api')).toBe('https://quan.example.com');
  });

  it('địa chỉ hỏng thì trả nguyên vào, không nổ', () => {
    // Ở Dart, `Uri.tryParse` trả null. Ở JavaScript, `new URL` NÉM. Nơi gọi đang dựng giao diện,
    // nên một ngoại lệ lọt ra sẽ làm trắng màn hình vì một chuỗi cấu hình sai.
    expect(suyRaDiaChiAnh('rác')).toBe('rác');
  });
});
