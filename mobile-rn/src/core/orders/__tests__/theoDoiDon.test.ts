import { type CustomerOrder, type OrderItem } from '../order';
import { conGiDeCho, monVuaSanSang } from '../theoDoiDon';

function mon(orderItemId: string, name: string, status: string): OrderItem {
  return {
    orderItemId,
    menuItemId: 'm_1',
    name,
    unitPrice: 1000,
    quantity: 1,
    status,
    lineTotal: 1000,
    estimatedReadyMinutesLow: null,
    estimatedReadyMinutesHigh: null,
    kitchenBusy: false,
  };
}

function don(status: string, items: OrderItem[]): CustomerOrder {
  return {
    orderId: 'ord_1',
    orderCode: 'ORD-1001',
    status,
    totalAmount: 1000,
    createdAt: '2026-09-03T10:00:00Z',
    items,
  };
}

describe('khi nào còn phải hỏi lại máy chủ', () => {
  it('còn món chưa tới bàn thì còn hỏi', () => {
    expect(conGiDeCho([don('Preparing', [mon('i1', 'Phở', 'Pending')])])).toBe(true);
    expect(conGiDeCho([don('Ready', [mon('i1', 'Phở', 'Ready')])])).toBe(true);
  });

  it('mọi món đã tới bàn thì NGỪNG hỏi', () => {
    // Hỏi mãi một đơn đã xong là đốt pin và dữ liệu di động của khách suốt bữa ăn. Đây là phần
    // khó thật của việc tự cập nhật — gọi `setInterval` thì dễ, biết lúc nào dừng mới khó.
    expect(conGiDeCho([don('Served', [mon('i1', 'Phở', 'Served')])])).toBe(false);
  });

  it('món đã huỷ không giữ vòng hỏi lại sống', () => {
    expect(
      conGiDeCho([don('Served', [mon('i1', 'Phở', 'Served'), mon('i2', 'Bún', 'Cancelled')])]),
    ).toBe(false);
  });

  it('đơn đã đóng thì thôi, dù món bên trong còn dở', () => {
    // Đơn bị huỷ giữa chừng: món vẫn ở `Pending` mãi mãi vì không ai nấu nữa.
    expect(conGiDeCho([don('Cancelled', [mon('i1', 'Phở', 'Pending')])])).toBe(false);
  });

  it('một đơn còn dở giữa nhiều đơn đã xong thì vẫn hỏi', () => {
    expect(
      conGiDeCho([
        don('Served', [mon('i1', 'Phở', 'Served')]),
        don('Preparing', [mon('i2', 'Bún', 'Pending')]),
      ]),
    ).toBe(true);
  });

  it('chưa có đơn nào thì vẫn hỏi', () => {
    // Khách có thể vừa đặt ở màn khác, hoặc nhân viên vừa thêm món tặng vào đơn.
    expect(conGiDeCho([])).toBe(true);
  });
});

describe('món vừa sẵn sàng giữa hai lần hỏi', () => {
  it('bắt đúng món vừa chuyển sang Ready', () => {
    const truoc = [
      don('Preparing', [mon('i1', 'Phở bò', 'Preparing'), mon('i2', 'Gỏi cuốn', 'Pending')]),
    ];
    const sau = [
      don('Preparing', [mon('i1', 'Phở bò', 'Ready'), mon('i2', 'Gỏi cuốn', 'Pending')]),
    ];

    expect(monVuaSanSang(truoc, sau)).toEqual(['Phở bò']);
  });

  it('KHÔNG báo lại món đã Ready từ trước', () => {
    // Không có ca này thì mỗi lần hỏi lại là một lần báo, và cứ 10 giây khách nhận một thông báo
    // cho món họ đã biết — đủ để họ tắt thông báo và bỏ lỡ món thật.
    const truoc = [don('Ready', [mon('i1', 'Phở bò', 'Ready')])];
    const sau = [don('Ready', [mon('i1', 'Phở bò', 'Ready')])];

    expect(monVuaSanSang(truoc, sau)).toEqual([]);
  });

  it('lần tải ĐẦU TIÊN không báo gì', () => {
    // Chưa có gì để so. Báo hết mọi món đang sẵn sàng lúc mở màn là dội một loạt thông báo cho
    // thứ khách đã nhìn thấy trên bàn rồi.
    const sau = [don('Ready', [mon('i1', 'Phở bò', 'Ready')])];

    expect(monVuaSanSang([], sau)).toEqual([]);
  });

  it('so theo mã món, không theo vị trí trong mảng', () => {
    // Bếp huỷ một món thì mảng ngắn lại. So theo vị trí sẽ lệch một bậc và báo nhầm gần hết
    // danh sách — đúng lúc khách đang chờ để biết món nào thật sự xong.
    const truoc = [
      don('Preparing', [
        mon('i1', 'Gỏi cuốn', 'Cancelled'),
        mon('i2', 'Phở bò', 'Preparing'),
        mon('i3', 'Chè bưởi', 'Preparing'),
      ]),
    ];
    const sau = [
      don('Preparing', [mon('i2', 'Phở bò', 'Ready'), mon('i3', 'Chè bưởi', 'Preparing')]),
    ];

    expect(monVuaSanSang(truoc, sau)).toEqual(['Phở bò']);
  });

  it('nhiều món cùng xong thì báo hết', () => {
    const truoc = [
      don('Preparing', [mon('i1', 'Phở bò', 'Preparing'), mon('i2', 'Bún chả', 'Preparing')]),
    ];
    const sau = [don('Ready', [mon('i1', 'Phở bò', 'Ready'), mon('i2', 'Bún chả', 'Ready')])];

    expect(monVuaSanSang(truoc, sau)).toEqual(['Phở bò', 'Bún chả']);
  });

  it('món nhảy thẳng từ Pending sang Ready vẫn được báo', () => {
    // Backend cho bếp nhảy cóc: món xong mà không ai kịp bấm "đang nấu".
    const truoc = [don('Placed', [mon('i1', 'Bia hơi', 'Pending')])];
    const sau = [don('Ready', [mon('i1', 'Bia hơi', 'Ready')])];

    expect(monVuaSanSang(truoc, sau)).toEqual(['Bia hơi']);
  });

  it('món chuyển thẳng sang Served KHÔNG báo "đang mang ra"', () => {
    // Đối chứng: món đã tới bàn rồi thì báo "đang được mang ra" là nói sai thì quá khứ.
    const truoc = [don('Preparing', [mon('i1', 'Phở bò', 'Preparing')])];
    const sau = [don('Served', [mon('i1', 'Phở bò', 'Served')])];

    expect(monVuaSanSang(truoc, sau)).toEqual([]);
  });
});
