import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type MyLoyalty, type Reward } from '../../core/loyalty/loyalty';
import { type LoyaltyApi } from '../../core/loyalty/loyaltyApi';
import { LoyaltyScreen, moTaViecSeXayRa } from '../LoyaltyScreen';

/** Bản giả: mã nào cũng ra token. Luật OTP được canh riêng ở `phoneOtp`. */
const GUI_MA_OTP_GIA = async () => ({ xacNhan: async () => 'token-otp' });
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
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(CHUA_NOI)} />,
    );

    await screen.findByText('Liên kết số điện thoại');
    expect(screen.queryByText(/lỗi/i)).toBeNull();
  });

  it('nói TRƯỚC điều sẽ xảy ra, và KHÔNG chỉ khách ra quầy nữa', async () => {
    // Câu cũ ở đây là "nếu số này đã từng tích điểm, nhờ nhân viên tại quầy nối hộ". Đường đó đã
    // gỡ: khách tự nối bằng OTP. Một câu chỉ khách đi làm việc không còn tồn tại còn tệ hơn im.
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(CHUA_NOI)} />,
    );

    const s = await screen.findByText(/Điểm thưởng được tính theo số điện thoại/);
    expect(s.props.children.join('')).not.toContain('quầy');
    expect(s.props.children.join('')).toContain('điểm sẽ về tài khoản ngay sau khi xác minh');
  });

  it('đi đủ HAI bước: gửi mã rồi mới nối', async () => {
    // Nối số giờ xác minh bằng OTP. Bước gửi mã KHÔNG được bỏ qua — nó là toàn bộ lý do máy chủ
    // dám nhận một số đã có hồ sơ điểm.
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(CHUA_NOI)} />,
    );

    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Gửi mã xác minh'));

    await fireEvent.changeText(await screen.findByLabelText('Mã xác minh'), '123456');
    await fireEvent.press(screen.getByLabelText('Xác minh và liên kết'));

    await screen.findByLabelText('320 điểm');
    expect(screen.getByText('Số đã liên kết: 0901234567')).toBeTruthy();
  });

  it('CHƯA gửi mã thì không có ô nhập mã — không bỏ qua được bước xác minh', async () => {
    // Đối chứng cho ca trên. Thiếu nó thì một màn hình vẽ sẵn cả hai ô vẫn xanh, và khách có thể
    // bấm liên kết mà chưa từng chứng minh mình sở hữu số.
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(CHUA_NOI)} />,
    );

    await screen.findByLabelText('Số điện thoại');
    expect(screen.queryByLabelText('Mã xác minh')).toBeNull();
    expect(screen.queryByLabelText('Xác minh và liên kết')).toBeNull();
  });

  it('mã sai thì cho gõ LẠI ngay, không bắt xin mã mới', async () => {
    // Mã cũ còn sống. Bắt xin lại từ đầu là thêm một tin nhắn và một vòng chờ cho một lỗi gõ.
    const guiMaHong = async () => ({
      xacNhan: async () => {
        throw new Error('XAC_MINH_THAT_BAI');
      },
    });
    await render(<LoyaltyScreen guiMaOtp={guiMaHong} accessToken="jwt" api={apiVoi(CHUA_NOI)} />);

    await fireEvent.changeText(await screen.findByLabelText('Số điện thoại'), '0901234567');
    await fireEvent.press(screen.getByLabelText('Gửi mã xác minh'));
    await fireEvent.changeText(await screen.findByLabelText('Mã xác minh'), '000000');
    await fireEvent.press(screen.getByLabelText('Xác minh và liên kết'));

    await screen.findByText(/Mã không đúng hoặc đã hết hạn/);
    // Vẫn đứng ở bước nhập mã, không bị đá về bước gõ số.
    expect(screen.getByLabelText('Mã xác minh')).toBeTruthy();
  });

  it('KHÔNG có thư viện OTP thì nói rõ, không hiện nút bấm không ăn thua', async () => {
    // Xảy ra trên Expo Go, nơi thư viện native của Firebase không có mặt.
    await render(<LoyaltyScreen guiMaOtp={undefined} accessToken="jwt" api={apiVoi(CHUA_NOI)} />);

    await screen.findByText(/Bản dựng này chưa gửi được mã xác minh/);
    expect(screen.queryByLabelText('Gửi mã xác minh')).toBeNull();
  });
});
describe('đã liên kết', () => {
  it('hiện điểm và ưu đãi đổi được', async () => {
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(DA_NOI)} />,
    );

    await screen.findByLabelText('320 điểm');
    expect(screen.getByText('Trà đào miễn phí')).toBeTruthy();
    expect(screen.getByText('200 điểm')).toBeTruthy();
  });

  it('chưa đủ điểm cho ưu đãi nào thì nói rõ, không để trống', async () => {
    await render(
      <LoyaltyScreen
        guiMaOtp={GUI_MA_OTP_GIA}
        accessToken="jwt"
        api={apiVoi({ ...DA_NOI, points: 10, availableRewards: [] })}
      />,
    );

    await screen.findByText('Chưa đủ điểm cho ưu đãi nào. Tiếp tục tích điểm nhé.');
  });

  it('KHÔNG đủ điểm thì nút đổi bị khoá, không để backend từ chối', async () => {
    // Bật nút rồi để backend trả LOYALTY_NOT_ENOUGH_POINTS là bắt khách chạm vào một lời từ chối
    // lẽ ra thấy trước được.
    await render(
      <LoyaltyScreen
        guiMaOtp={GUI_MA_OTP_GIA}
        accessToken="jwt"
        api={apiVoi({ ...DA_NOI, points: 199 })}
      />,
    );

    const nut = await screen.findByLabelText('Đổi Trà đào miễn phí');
    expect(nut.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('đổi điểm (#34)', () => {
  it('hộp thoại nói RÕ trừ bao nhiêu điểm và KHÔNG hoàn lại', async () => {
    // Đây là thao tác tiêu tài sản thật của khách, không phải một thao tác giao diện.
    const hoi = jest.fn().mockResolvedValue(false);
    await render(
      <LoyaltyScreen
        guiMaOtp={GUI_MA_OTP_GIA}
        accessToken="jwt"
        api={apiVoi(DA_NOI)}
        hoiXacNhan={hoi}
      />,
    );

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
      <LoyaltyScreen
        guiMaOtp={GUI_MA_OTP_GIA}
        accessToken="jwt"
        api={apiVoi(DA_NOI, { doiDiem })}
        hoiXacNhan={tuChoi}
      />,
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
      <LoyaltyScreen
        accessToken="jwt"
        api={api}
        guiMaOtp={GUI_MA_OTP_GIA}
        hoiXacNhan={dongY}
        onBaoTin={baoTin}
      />,
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
    await render(
      <LoyaltyScreen accessToken="jwt" api={api} guiMaOtp={GUI_MA_OTP_GIA} hoiXacNhan={dongY} />,
    );

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
    await render(
      <LoyaltyScreen accessToken="jwt" api={api} guiMaOtp={GUI_MA_OTP_GIA} hoiXacNhan={dongY} />,
    );

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

    await render(
      <LoyaltyScreen
        accessToken="jwt"
        api={api}
        guiMaOtp={GUI_MA_OTP_GIA}
        timDonDangMo={async () => null}
      />,
    );
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
      <LoyaltyScreen
        accessToken="jwt"
        api={api}
        guiMaOtp={GUI_MA_OTP_GIA}
        timDonDangMo={async () => 'ORD-1042'}
      />,
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
      <LoyaltyScreen
        accessToken="jwt"
        api={api}
        guiMaOtp={GUI_MA_OTP_GIA}
        timDonDangMo={async () => 'ORD-1042'}
      />,
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

    await render(
      <LoyaltyScreen
        accessToken="jwt"
        api={api}
        guiMaOtp={GUI_MA_OTP_GIA}
        timDonDangMo={async () => null}
      />,
    );
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
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(CO_PHIEU)} />,
    );

    expect(await screen.findByText('Phiếu chưa dùng')).toBeTruthy();
    expect(screen.getByText('Chè bưởi')).toBeTruthy();
  });

  it('không có phiếu nào thì KHÔNG hiện mục đó', async () => {
    // Một tiêu đề "Phiếu chưa dùng" đứng trên khoảng trống nói rằng có chỗ để nhìn, trong khi
    // thật ra chưa có gì. DA_NOI không có phiếu nào.
    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(DA_NOI)} />,
    );

    await screen.findByText('Ưu đãi đổi được ngay');
    expect(screen.queryByText('Phiếu chưa dùng')).toBeNull();
  });

  it('ngày đổi hiện theo múi giờ MÁY, không phải UTC', async () => {
    // 13:40 UTC ngày 25 là 20:40 ngày 25 ở Việt Nam — cùng ngày. Nhưng cắt chuỗi ISO cho phiếu
    // đổi lúc 22:00 giờ Việt Nam (15:00 UTC hôm trước ở vài múi) sẽ lệch một ngày. Phép kiểm này
    // chốt việc màn hình đi qua Date chứ không slice chuỗi.
    const d = new Date('2026-08-25T13:40:00.000Z');
    const mongDoi = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

    await render(
      <LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(CO_PHIEU)} />,
    );

    expect(await screen.findByText(new RegExp('Đã đổi ' + mongDoi))).toBeTruthy();
  });

  it('ngày hỏng thì hiện nguyên văn, không hiện Invalid Date', async () => {
    const hong: MyLoyalty = {
      ...CO_PHIEU,
      phieuChuaDung: [{ ...CO_PHIEU.phieuChuaDung[0]!, redeemedAt: '' }],
    };
    await render(<LoyaltyScreen guiMaOtp={GUI_MA_OTP_GIA} accessToken="jwt" api={apiVoi(hong)} />);

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
