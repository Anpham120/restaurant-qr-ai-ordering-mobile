import { fireEvent, render, screen } from '@testing-library/react-native';

import { AuthException } from '../../core/auth/authApi';
import { type MyLoyalty } from '../../core/loyalty/loyalty';
import { type LoyaltyApi } from '../../core/loyalty/loyaltyApi';
import { LoyaltyScreen } from '../LoyaltyScreen';

const CHUA_NOI: MyLoyalty = {
  linked: false,
  phoneNumber: null,
  points: 0,
  availableRewards: [],
  hang: 'BAC',
  tenHang: 'Bạc',
  chiTieu12Thang: 0,
  tenHangKeTiep: 'Vàng',
  conThieu: 5_000_000,
};

const DA_NOI: MyLoyalty = {
  linked: true,
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
};

function apiVoi(dau: MyLoyalty, ghiDe: Partial<LoyaltyApi> = {}): LoyaltyApi {
  return {
    cuaToi: async () => dau,
    noiSo: async () => DA_NOI,
    doiDiem: async () => ({
      redemptionId: 'rd',
      rewardName: 'Trà đào miễn phí',
      pointsSpent: 200,
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

describe('ưu đãi giảm tiền cần một đơn', () => {
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

  it('không có đơn đang mở thì DỪNG, không gọi đổi điểm', async () => {
    // Khách đã bấm qua hộp xác nhận "điểm đã trừ không hoàn lại". Để backend từ chối sau bước đó
    // là bắt họ chịu một khoảnh khắc tưởng rằng điểm vừa mất.
    let soLanDoi = 0;
    const api = apiVoi(GIAM, {
      doiDiem: async () => {
        soLanDoi++;
        throw new Error('lẽ ra không được gọi');
      },
    });

    await render(<LoyaltyScreen accessToken="jwt" api={api} timDonDangMo={async () => null} />);
    await screen.findByLabelText('Đổi Giảm 50.000đ');
    await fireEvent.press(screen.getByLabelText('Đổi Giảm 50.000đ'));

    expect(soLanDoi).toBe(0);
    expect(screen.getByText(/Chưa có đơn nào đang mở/)).toBeTruthy();
  });

  it('có đơn đang mở thì gửi kèm MÃ ĐƠN xuống backend', async () => {
    let maDaGui: string | undefined = 'chua-goi';
    const api = apiVoi(GIAM, {
      doiDiem: async (_t: string, _r: string, _k: string, orderId?: string) => {
        maDaGui = orderId;
        return { redemptionId: 'rd', rewardName: 'Giảm 50.000đ', pointsSpent: 200, soDuMoi: GIAM };
      },
    });

    await render(
      <LoyaltyScreen accessToken="jwt" api={api} timDonDangMo={async () => 'ORD-1042'} />,
    );
    await screen.findByLabelText('Đổi Giảm 50.000đ');
    await fireEvent.press(screen.getByLabelText('Đổi Giảm 50.000đ'));

    expect(maDaGui).toBe('ORD-1042');
  });

  it('ưu đãi TẶNG MÓN không hỏi đơn — phiếu tặng món không gắn hoá đơn nào', async () => {
    let daHoiDon = false;
    let maDaGui: string | undefined = 'chua-goi';
    const api = apiVoi(DA_NOI, {
      doiDiem: async (_t: string, _r: string, _k: string, orderId?: string) => {
        maDaGui = orderId;
        return {
          redemptionId: 'rd',
          rewardName: 'Trà đào miễn phí',
          pointsSpent: 200,
          soDuMoi: DA_NOI,
        };
      },
    });

    await render(
      <LoyaltyScreen
        accessToken="jwt"
        api={api}
        timDonDangMo={async () => {
          daHoiDon = true;
          return 'ORD-1042';
        }}
      />,
    );
    await screen.findByLabelText('Đổi Trà đào miễn phí');
    await fireEvent.press(screen.getByLabelText('Đổi Trà đào miễn phí'));

    expect(daHoiDon).toBe(false);
    expect(maDaGui).toBeUndefined();
  });
});
