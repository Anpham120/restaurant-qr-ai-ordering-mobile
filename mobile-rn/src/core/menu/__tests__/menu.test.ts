import { type MenuCategory, type MenuItem, nhomTheoDanhMuc, urlAnh, locMonTheoTen } from '../menu';

function dm(categoryId: string, name: string): MenuCategory {
  return { categoryId, name };
}

function mon(id: string, categoryId: string, con = true, ten?: string): MenuItem {
  return {
    id,
    name: ten ?? `Món ${id}`,
    description: null,
    price: 50000,
    categoryId,
    categoryName: categoryId,
    imageUrl: null,
    isAvailable: con,
    tags: [],
  };
}

describe('nhóm món theo danh mục', () => {
  it('giữ NGUYÊN thứ tự danh mục do máy chủ trả về', () => {
    // Đó là thứ tự quán muốn thực đơn hiện ra (khai vị trước, tráng miệng sau), không phải thứ
    // tự bảng chữ cái.
    const nhom = nhomTheoDanhMuc(
      [dm('c2', 'Zeta'), dm('c1', 'Alpha')],
      [mon('m1', 'c1'), mon('m2', 'c2')],
    );

    expect(nhom.map((n) => n.tenDanhMuc)).toEqual(['Zeta', 'Alpha']);
  });

  it('bỏ danh mục rỗng', () => {
    // Một tiêu đề không có món nào bên dưới trông như lỗi tải.
    const nhom = nhomTheoDanhMuc([dm('c1', 'Có món'), dm('c2', 'Rỗng')], [mon('m1', 'c1')]);

    expect(nhom.map((n) => n.tenDanhMuc)).toEqual(['Có món']);
  });

  it('KHÔNG đánh rơi món mồ côi — gom vào khối cuối', () => {
    // Món có categoryId không khớp danh mục nào vẫn phải hiện ra. Lặng lẽ bỏ đi nghĩa là một món
    // có thật biến mất khỏi thực đơn vì lỗi dữ liệu ở chỗ khác, và không ai thấy gì để sửa.
    const nhom = nhomTheoDanhMuc([dm('c1', 'Khai vị')], [mon('m1', 'c1'), mon('m2', 'KHONG_CO')]);

    expect(nhom.map((n) => n.tenDanhMuc)).toEqual(['Khai vị', 'Món khác']);
    expect(nhom[1]!.mon).toHaveLength(1);
    expect(nhom[1]!.mon[0]!.id).toBe('m2');
  });

  it('tổng số món sau khi nhóm bằng đúng số món đầu vào', () => {
    // Bất biến đếm được: dù nhóm thế nào cũng không được mất hay nhân đôi món.
    const dsMon = [mon('m1', 'c1'), mon('m2', 'c1'), mon('m3', 'c2'), mon('m4', 'LAC')];
    const nhom = nhomTheoDanhMuc([dm('c1', 'A'), dm('c2', 'B')], dsMon);

    expect(nhom.reduce((s, n) => s + n.mon.length, 0)).toBe(dsMon.length);
  });

  it('không có danh mục nào thì mọi món vào khối Món khác', () => {
    const nhom = nhomTheoDanhMuc([], [mon('m1', 'c1')]);
    expect(nhom).toHaveLength(1);
    expect(nhom[0]!.tenDanhMuc).toBe('Món khác');
  });

  it('không có món nào thì không có khối nào', () => {
    expect(nhomTheoDanhMuc([dm('c1', 'A')], [])).toEqual([]);
  });

  it('giữ cả món ĐANG HẾT, không lọc bỏ', () => {
    // Khách cần biết quán CÓ món đó, kể cả hôm nay hết. Lọc đi thì họ tưởng quán không bán.
    const nhom = nhomTheoDanhMuc([dm('c1', 'A')], [mon('m1', 'c1', false)]);
    expect(nhom[0]!.mon[0]!.isAvailable).toBe(false);
  });

  it('categoryId tên __proto__ không làm mất món', () => {
    // Ca này KHÔNG có ở bản Flutter vì Map của Dart không có prototype để đụng vào. Ở JavaScript,
    // gom nhóm bằng object thường sẽ khiến một categoryId tên "__proto__" ghi đè prototype thay
    // vì tạo khoá — món biến mất khỏi thực đơn, hoặc kéo theo cả nhóm khác.
    const nhom = nhomTheoDanhMuc([dm('c1', 'A')], [mon('m1', 'c1'), mon('m2', '__proto__')]);

    expect(nhom.reduce((s, n) => s + n.mon.length, 0)).toBe(2);
    expect(nhom.map((n) => n.tenDanhMuc)).toEqual(['A', 'Món khác']);
  });
});

describe('địa chỉ ảnh món', () => {
  // Ảnh KHÔNG do API phục vụ. Đo trên hệ thống đang chạy:
  //   :8081/menu-images/...  → 401   (API)
  //   :8080/menu-images/...  → 200   (web)
  const base = 'http://10.0.2.2:8080';

  it('ghép đường dẫn tương đối vào base của ẢNH', () => {
    expect(urlAnh('/menu-images/04.webp', base)).toBe('http://10.0.2.2:8080/menu-images/04.webp');
  });

  it('giữ NGUYÊN URL tuyệt đối', () => {
    // Nếu một ngày ảnh chuyển sang CDN thì imageUrl là URL đầy đủ; ghép thêm base vào trước sẽ
    // tạo ra một địa chỉ vô nghĩa và mọi ảnh hỏng cùng lúc.
    expect(urlAnh('https://cdn.example.com/a.webp', base)).toBe('https://cdn.example.com/a.webp');
  });

  it('base có dấu / ở cuối không tạo ra //', () => {
    expect(urlAnh('/menu-images/04.webp', `${base}/`)).toBe(
      'http://10.0.2.2:8080/menu-images/04.webp',
    );
  });

  it('đường dẫn không bắt đầu bằng / vẫn ghép đúng', () => {
    expect(urlAnh('menu-images/04.webp', base)).toBe('http://10.0.2.2:8080/menu-images/04.webp');
  });

  it('null hoặc rỗng trả null, không trả base trơ trọi', () => {
    // Trả về base trơ trọi sẽ khiến thẻ ảnh đi tải trang chủ và hiện lỗi khó hiểu.
    expect(urlAnh(null, base)).toBeNull();
    expect(urlAnh('', base)).toBeNull();
    expect(urlAnh('   ', base)).toBeNull();
  });
});

describe('tìm món không cần gõ dấu', () => {
  // Bản Flutter KHÔNG có test nào cho hàm này, và bản RN viết lại nó bằng normalize('NFD') thay
  // cho bảy biểu thức thay thế. Đổi cách làm mà không có cổng chặn là cách chắc chắn để đánh rơi
  // một nguyên âm nào đó mà không ai biết cho tới khi khách gõ trúng nó.
  const ds = [
    mon('m1', 'c1', true, 'Phở bò tái'),
    mon('m2', 'c1', true, 'Đậu hũ chiên sả'),
    mon('m3', 'c1', true, 'Gỏi cuốn tôm thịt'),
    mon('m4', 'c1', true, 'Cơm tấm sườn bì'),
  ];

  const ten = (r: readonly MenuItem[]) => r.map((m) => m.name);

  it('gõ không dấu vẫn ra món có dấu', () => {
    expect(ten(locMonTheoTen(ds, 'pho'))).toEqual(['Phở bò tái']);
    expect(ten(locMonTheoTen(ds, 'goi cuon'))).toEqual(['Gỏi cuốn tôm thịt']);
  });

  it('chữ đ tìm được bằng d', () => {
    // NFD KHÔNG tách `đ`: nó là ký tự Latin độc lập U+0111, không phải `d` cộng dấu. Thiếu bước
    // thay riêng thì gõ "dau hu" không bao giờ ra "Đậu hũ".
    expect(ten(locMonTheoTen(ds, 'dau hu'))).toEqual(['Đậu hũ chiên sả']);
  });

  it('gõ có dấu cũng ra', () => {
    expect(ten(locMonTheoTen(ds, 'Phở'))).toEqual(['Phở bò tái']);
  });

  it('không phân biệt hoa thường', () => {
    expect(ten(locMonTheoTen(ds, 'COM TAM'))).toEqual(['Cơm tấm sườn bì']);
  });

  it('từ khoá rỗng trả nguyên danh sách, giữ đúng thứ tự', () => {
    expect(locMonTheoTen(ds, '')).toEqual(ds);
    expect(locMonTheoTen(ds, '   ')).toEqual(ds);
  });

  it('không khớp gì thì trả danh sách rỗng, không trả tất cả', () => {
    expect(locMonTheoTen(ds, 'pizza')).toEqual([]);
  });

  it('giữ nguyên thứ tự đầu vào khi khớp nhiều món', () => {
    const nhieu = [
      mon('a', 'c1', true, 'Cơm gà'),
      mon('b', 'c1', true, 'Bún bò'),
      mon('c', 'c1', true, 'Cơm tấm'),
    ];
    expect(ten(locMonTheoTen(nhieu, 'com'))).toEqual(['Cơm gà', 'Cơm tấm']);
  });
});
