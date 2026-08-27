import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type MyLoyalty, type Reward } from '../../core/loyalty/loyalty';
import { type LoyaltyApi } from '../../core/loyalty/loyaltyApi';
import { LoyaltyScreen, moTaViecSeXayRa } from '../LoyaltyScreen';

const CHUA_NOI: MyLoyalty = {
  linked: false,
  coHoSo: false,
  phoneNumber: null,
  points: 0,
  availableRewards: [],
  hang: 'BAC',
  tenHang: 'Bạc',
  chiTieu12Thang: 0,
  tenHangKeTiep: 'Vàng',
  conThieu: 5_000_000,
  phieuChuaDung: [],
};

const DA_NOI: MyLoyalty = {
  linked: true,
  coHoSo: true,
  phoneNumber: '0901234567',
  points: 320,
  availableRewards: [
    {
      rewardId: 'rw_1',
      name: 'Trà đào miễn phí',
      description: 'Một ly',
      pointsRequired: 200,
      loai: 'FREE_ITEM',
      soTienGiam: null,
      hangToiThieu: 'BAC',
    },
  ],
  hang: 'BAC',
  tenHang: 'Bạc',
  chiTieu12Thang: 1_200_000,
  tenHangKeTiep: 'Vàng',
  conThieu: 3_800_000,
  phieuChuaDung: [],
};

function apiVoi(dau: MyLoyalty, ghiDe: Partial<LoyaltyApi> = {}): LoyaltyApi {
  return {
    cuaToi: async () => dau,
    noiSo: async () => DA_NOI,
    xinMaNoiSo: async () => ({ ma: '261860', hetHan: '2026-01-01T00:05:00Z' }),
    doiDiem: async () => ({
      redemptionId: 'rd',
      rewardName: 'Trà đào miễn phí',
      pointsSpent: 200,
      ma: null,
      soDuMoi: { ...DA_NOI, points: 120, availableRewards: [] },
    }),
    ...ghiDe,
  };
}

const dongY = () => Promise.resolve(true);
const tuChoi = () => Promise.resolve(false);

describe('chưa liên kết số điện thoại', () => {
  it('hiện lời MỜI liên kết, không hiện thông báo hỏng', async () => {
    // `linked: false` là trạng thái bình thường của mọi tài khoản mới.
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(CHUA_NOI)} />);

    await screen.findByText('Liên kết số điện thoại');
    expect(screen.queryByText(/lỗi/i)).toBeNull();
  });

  it('nói TRƯỚC giới hạn, không để khách gõ số rồi mới nhận lỗi khó hiểu', async () => {
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(CHUA_NOI)} />);

    const s = await screen.findByText(/Điểm thưởng được tính theo số điện thoại/);
    expect(s.props.children.join('')).toContain('nhân viên tại quầy');
  });

  it('nối số thành công thì chuyển sang màn hình có điểm', async () => {
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(CHUA_NOI)} />);

    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Liên kết'));

    await screen.findByLabelText('320 điểm');
    expect(screen.getByText('Số đã liên kết: 0901234567')).toBeTruthy();
  });

  it('số đã là thành viên: hiện câu chỉ ra việc cần làm', async () => {
    const api = apiVoi(CHUA_NOI, {
      noiSo: async () => {
        throw new AuthException(
          'LOYALTY_PHONE_ALREADY_MEMBER',
          'Số này đã có tài khoản tích điểm. Nhờ nhân viên tại quầy nối vào tài khoản của bạn.',
        );
      },
    });
    await render(<LoyaltyScreen accessToken="jwt" api={api} />);

    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Liên kết'));

    await screen.findByText(/Nhờ nhân viên tại quầy/);
  });

  it('số đã là thành viên: đưa LUÔN mã để đọc ở quầy', async () => {
    // Câu "nhờ nhân viên nối hộ" mà không kèm mã thì khách phải tự đi tìm nơi lấy mã — và trong
    // app không có nơi nào khác cấp mã cả. Mã phải hiện ngay tại chỗ khách vừa bị từ chối.
    const api = apiVoi(CHUA_NOI, {
      noiSo: async () => {
        throw new AuthException(
          'LOYALTY_PHONE_ALREADY_MEMBER',
          'Số này đã có tài khoản tích điểm.',
        );
      },
      xinMaNoiSo: async () => ({ ma: '261860', hetHan: '2026-01-01T00:05:00Z' }),
    });
    await render(<LoyaltyScreen accessToken="jwt" api={api} />);

    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Liên kết'));

    await screen.findByText('261860');
    // Đọc từng chữ số: mã đọc miệng cho nhân viên, "hai sáu một tám sáu không" mới là thứ khách
    // cần nghe, chứ không phải "hai trăm sáu mươi mốt nghìn tám trăm sáu mươi".
    expect(screen.getByLabelText('Mã nối tài khoản 2 6 1 8 6 0')).toBeTruthy();
  });

  it('xin mã hỏng thì vẫn giữ câu hướng dẫn, không nuốt mất', async () => {
    // Nếu để lỗi của bước xin mã ghi đè lên lời nhắn, khách mất luôn manh mối duy nhất.
    const api = apiVoi(CHUA_NOI, {
      noiSo: async () => {
        throw new AuthException(
          'LOYALTY_PHONE_ALREADY_MEMBER',
          'Số này đã có tài khoản tích điểm. Nhờ nhân viên tại quầy nối vào tài khoản của bạn.',
        );
      },
      xinMaNoiSo: async () => {
        throw new Error('mạng rớt');
      },
    });
    await render(<LoyaltyScreen accessToken="jwt" api={api} />);

    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Liên kết'));

    await screen.findByText(/Nhờ nhân viên tại quầy/);
  });
});

describe('đã liên kết', () => {
  it('hiện điểm và ưu đãi đổi được', async () => {
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(DA_NOI)} />);

    await screen.findByLabelText('320 điểm');
    expect(screen.getByText('Trà đào miễn phí')).toBeTruthy();
    expect(screen.getByText('200 điểm')).toBeTruthy();
  });

  it('chưa đủ điểm cho ưu đãi nào thì nói rõ, không để trống', async () => {
    await render(
      <LoyaltyScreen
        accessToken="jwt"
        api={apiVoi({ ...DA_NOI, points: 10, availableRewards: [] })}
      />,
    );

    await screen.findByText('Chưa đủ điểm cho ưu đãi nào. Tiếp tục tích điểm nhé.');
  });

  it('KHÔNG đủ điểm thì nút đổi bị khoá, không để backend từ chối', async () => {
    // Bật nút rồi để backend trả LOYALTY_NOT_ENOUGH_POINTS là bắt khách chạm vào một lời từ chối
    // lẽ ra thấy trước được.
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi({ ...DA_NOI, points: 199 })} />);

    const nut = await screen.findByLabelText('Đổi Trà đào miễn phí');
    expect(nut.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('đổi điểm (#34)', () => {
  it('hộp thoại nói RÕ trừ bao nhiêu điểm và KHÔNG hoàn lại', async () => {
    // Đây là thao tác tiêu tài sản thật của khách, không phải một thao tác giao diện.
    const hoi = jest.fn().mockResolvedValue(false);
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(DA_NOI)} hoiXacNhan={hoi} />);

    await fireEvent.press(await screen.findByLabelText('Đổi Trà đào miễn phí'));

    expect(hoi).toHaveBeenCalledWith(
      'Đổi ưu đãi?',
      expect.stringContaining('Sẽ trừ 200 điểm') as unknown as string,
    );
    expect(hoi.mock.calls[0]![1]).toContain('không hoàn lại');
  });

  it('từ chối ở hộp thoại thì KHÔNG gọi API', async () => {
    const doiDiem = jest.fn();
    await render(
      <LoyaltyScreen accessToken="jwt" api={apiVoi(DA_NOI, { doiDiem })} hoiXacNhan={tuChoi} />,
    );

    await fireEvent.press(await screen.findByLabelText('Đổi Trà đào miễn phí'));

    expect(doiDiem).not.toHaveBeenCalled();
  });

  it('đổi xong thì hiện SỐ DƯ MỚI ngay, không gọi thêm lượt nào', async () => {
    // Gọi lượt hai tạo ra khoảng thời gian màn hình còn hiện số dư CŨ — đúng lúc khách đang nhìn
    // xem điểm đã trừ chưa.
    let soLanDoc = 0;
    const api = apiVoi(DA_NOI, {
      cuaToi: async () => {
        soLanDoc++;
        return DA_NOI;
      },
    });
    const baoTin = jest.fn();
    await render(
      <LoyaltyScreen accessToken="jwt" api={api} hoiXacNhan={dongY} onBaoTin={baoTin} />,
    );

    await fireEvent.press(await screen.findByLabelText('Đổi Trà đào miễn phí'));

    await screen.findByLabelText('120 điểm');
    expect(soLanDoc).toBe(1);
    expect(baoTin).toHaveBeenCalledWith('Đã đổi Trà đào miễn phí · -200 điểm');
  });

  it('CÙNG ưu đãi thì hai lần bấm dùng CÙNG một khoá idempotency', async () => {
    // Ở đây khoá tiêu điểm THẬT của khách. Tạo khoá mới mỗi lượt dựng là trừ điểm hai lần.
    const khoa: string[] = [];
    const api = apiVoi(DA_NOI, {
      doiDiem: async (_t: string, _r: string, k: string) => {
        khoa.push(k);
        throw new AuthException('NETWORK_ERROR', 'Không kết nối được máy chủ.');
      },
    });
    await render(<LoyaltyScreen accessToken="jwt" api={api} hoiXacNhan={dongY} />);

    const nut = await screen.findByLabelText('Đổi Trà đào miễn phí');
    await fireEvent.press(nut);
    await fireEvent.press(nut);

    expect(khoa).toHaveLength(2);
    expect(khoa[0]).toBe(khoa[1]);
  });

  it('không đủ điểm lúc đổi: GIỮ câu báo lỗi và đọc lại số dư thật', async () => {
    let soLanDoc = 0;
    const api = apiVoi(DA_NOI, {
      cuaToi: async () => {
        soLanDoc++;
        return soLanDoc === 1 ? DA_NOI : { ...DA_NOI, points: 10, availableRewards: [] };
      },
      doiDiem: async () => {
        throw new AuthException('LOYALTY_NOT_ENOUGH_POINTS', 'Chưa đủ điểm cho ưu đãi này.');
      },
    });
    await render(<LoyaltyScreen accessToken="jwt" api={api} hoiXacNhan={dongY} />);

    await fireEvent.press(await screen.findByLabelText('Đổi Trà đào miễn phí'));

    await screen.findByText('Chưa đủ điểm cho ưu đãi này.');
    expect(screen.getByLabelText('10 điểm')).toBeTruthy();
    expect(soLanDoc).toBe(2);
  });
});

describe('ưu đãi giảm tiền sinh ra mã', () => {
  const GIAM: MyLoyalty = {
    ...DA_NOI,
    availableRewards: [
      {
        rewardId: 'rw_disc_50',
        name: 'Giảm 50.000đ',
        description: null,
        pointsRequired: 200,
        loai: 'DISCOUNT',
        soTienGiam: 50_000,
        hangToiThieu: 'BAC',
      },
    ],
  };

  it('KHÔNG cần đơn đang mở — ưu đãi giảm tiền nay sinh ra một mã', async () => {
    // Đảo ngược hành vi cũ, và đó là chủ ý. Trước đây ưu đãi giảm tiền ghi thẳng vào
    // orders.discount_amount, mà hoá đơn bàn không bao giờ đọc cấp đó — khách mất điểm và vẫn
    // trả đủ tiền. Nay nó ra một mã, tiêu ở cấp hoá đơn, nên không phụ thuộc vào đơn nào cả.
    let soLanDoi = 0;
    const api = apiVoi(GIAM, {
      doiDiem: async () => {
        soLanDoi++;
        return {
          redemptionId: 'rd',
          rewardName: 'Giảm 50.000đ',
          pointsSpent: 200,
          ma: 'A7K2M9X3',
          soDuMoi: GIAM,
        };
      },
    });

    await render(<LoyaltyScreen accessToken="jwt" api={api} timDonDangMo={async () => null} />);
    await screen.findByLabelText('Đổi Giảm 50.000đ');
    await fireEvent.press(screen.getByLabelText('Đổi Giảm 50.000đ'));

    expect(soLanDoi).toBe(1);
    expect(screen.queryByText(/Chưa có đơn nào đang mở/)).toBeNull();
  });

  it('giảm tiền KHÔNG gửi mã đơn, kể cả khi bàn đang có đơn mở', async () => {
    // Gửi mã đơn ở đây là nối lại đúng cấp giảm giá vừa bị gỡ bỏ vì nó ăn mất tiền của khách.
    let maDaGui: string | undefined = 'chua-goi';
    const api = apiVoi(GIAM, {
      doiDiem: async (_t: string, _r: string, _k: string, orderId?: string) => {
        maDaGui = orderId;
        return {
          redemptionId: 'rd',
          rewardName: 'Giảm 50.000đ',
          pointsSpent: 200,
          ma: null,
          soDuMoi: GIAM,
        };
      },
    });

    await render(
      <LoyaltyScreen accessToken="jwt" api={api} timDonDangMo={async () => 'ORD-1042'} />,
    );
    await screen.findByLabelText('Đổi Giảm 50.000đ');
    await fireEvent.press(screen.getByLabelText('Đổi Giảm 50.000đ'));

    expect(maDaGui).toBeUndefined();
  });

  it('TẶNG MÓN có đơn đang mở thì gửi kèm mã đơn — món vào đơn, bếp làm ngay', async () => {
    let maDaGui: string | undefined = 'chua-goi';
    const api = apiVoi(DA_NOI, {
      doiDiem: async (_t: string, _r: string, _k: string, orderCode?: string) => {
        maDaGui = orderCode;
        return {
          redemptionId: 'rd',
          rewardName: 'Trà đào miễn phí',
          pointsSpent: 200,
          ma: null,
          soDuMoi: DA_NOI,
        };
      },
    });

    await render(
      <LoyaltyScreen accessToken="jwt" api={api} timDonDangMo={async () => 'ORD-1042'} />,
    );
    await screen.findByLabelText('Đổi Trà đào miễn phí');
    await fireEvent.press(screen.getByLabelText('Đổi Trà đào miễn phí'));

    expect(maDaGui).toBe('ORD-1042');
  });

  it('TẶNG MÓN không có đơn thì vẫn đổi được — thành phiếu để dành', async () => {
    // Khác hẳn ưu đãi giảm tiền: khách đổi ở nhà để dành là chuyện hợp lệ, ép phải có đơn sẽ chặn
    // mất trường hợp đó.
    let daGoi = false;
    let maDaGui: string | undefined = 'chua-goi';
    const api = apiVoi(DA_NOI, {
      doiDiem: async (_t: string, _r: string, _k: string, orderCode?: string) => {
        daGoi = true;
        maDaGui = orderCode;
        return {
          redemptionId: 'rd',
          rewardName: 'Trà đào miễn phí',
          pointsSpent: 200,
          ma: null,
          soDuMoi: DA_NOI,
        };
      },
    });

    await render(<LoyaltyScreen accessToken="jwt" api={api} timDonDangMo={async () => null} />);
    await screen.findByLabelText('Đổi Trà đào miễn phí');
    await fireEvent.press(screen.getByLabelText('Đổi Trà đào miễn phí'));

    expect(daGoi).toBe(true);
    expect(maDaGui).toBeUndefined();
  });
});

describe('phiếu chưa dùng', () => {
  const CO_PHIEU: MyLoyalty = {
    ...DA_NOI,
    phieuChuaDung: [
      {
        redemptionId: 'red_1',
        rewardName: 'Chè bưởi',
        pointsSpent: 350,
        redeemedAt: '2026-08-25T13:40:00.000Z',
        ma: null,
      },
    ],
  };

  it('hiện phiếu khách đã đổi', async () => {
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(CO_PHIEU)} />);

    expect(await screen.findByText('Phiếu chưa dùng')).toBeTruthy();
    expect(screen.getByText('Chè bưởi')).toBeTruthy();
  });

  it('không có phiếu nào thì KHÔNG hiện mục đó', async () => {
    // Một tiêu đề "Phiếu chưa dùng" đứng trên khoảng trống nói rằng có chỗ để nhìn, trong khi
    // thật ra chưa có gì. DA_NOI không có phiếu nào.
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(DA_NOI)} />);

    await screen.findByText('Ưu đãi đổi được ngay');
    expect(screen.queryByText('Phiếu chưa dùng')).toBeNull();
  });

  it('ngày đổi hiện theo múi giờ MÁY, không phải UTC', async () => {
    // 13:40 UTC ngày 25 là 20:40 ngày 25 ở Việt Nam — cùng ngày. Nhưng cắt chuỗi ISO cho phiếu
    // đổi lúc 22:00 giờ Việt Nam (15:00 UTC hôm trước ở vài múi) sẽ lệch một ngày. Phép kiểm này
    // chốt việc màn hình đi qua Date chứ không slice chuỗi.
    const d = new Date('2026-08-25T13:40:00.000Z');
    const mongDoi = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(CO_PHIEU)} />);

    expect(await screen.findByText(new RegExp('Đã đổi ' + mongDoi))).toBeTruthy();
  });

  it('ngày hỏng thì hiện nguyên văn, không hiện Invalid Date', async () => {
    const hong: MyLoyalty = {
      ...CO_PHIEU,
      phieuChuaDung: [{ ...CO_PHIEU.phieuChuaDung[0]!, redeemedAt: '' }],
    };
    await render(<LoyaltyScreen accessToken="jwt" api={apiVoi(hong)} />);

    await screen.findByText('Chè bưởi');
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
});

describe('câu nói trước khi trừ điểm', () => {
  const tangMon: Reward = {
    rewardId: 'rw_1',
    name: 'Chè bưởi',
    description: null,
    pointsRequired: 350,
    loai: 'FREE_ITEM',
    soTienGiam: null,
    hangToiThieu: 'BAC',
  };
  const giamTien: Reward = { ...tangMon, loai: 'DISCOUNT', soTienGiam: 50_000 };

  it('tặng món CÓ đơn: nói món vào đơn nào', () => {
    expect(moTaViecSeXayRa(tangMon, 'ORD-1042')).toContain('ORD-1042');
    expect(moTaViecSeXayRa(tangMon, 'ORD-1042')).toContain('bếp làm ngay');
  });

  it('tặng món KHÔNG có đơn: nói rõ đây là phiếu để dành', () => {
    // Cùng một nút cho ra hai kết quả khác hẳn nhau. Nói nhầm ở đây nghĩa là khách bấm đổi vì
    // tưởng món sẽ ra, rồi ngồi chờ một món không ai làm.
    const cau = moTaViecSeXayRa(tangMon, null);
    expect(cau).toContain('phiếu');
    expect(cau).not.toContain('bếp');
  });

  it('giảm tiền: nói khách sẽ nhận một MÃ, không nhắc tới đơn', () => {
    // Nhắc tới đơn đang mở là nói sai: mã dùng được ở bất kỳ hoá đơn nào, kể cả hoá đơn khách
    // thanh toán trên web bằng máy người khác.
    const cau = moTaViecSeXayRa(giamTien, 'ORD-7');
    expect(cau).toContain('mã');
    expect(cau).not.toContain('ORD-7');
  });
});
