import { type TableSession } from '../../tables/tableSession';
import { type LoyaltyApi } from '../loyaltyApi';
import { type MoLaiPhien, dongBoTaiKhoan } from '../dongBoTaiKhoan';
import { type MyLoyalty } from '../loyalty';

const DIEM: MyLoyalty = {
  linked: true,
  phoneNumber: '0901234567',
  points: 1200,
  availableRewards: [],
  hang: 'VANG',
  tenHang: 'Vàng',
  chiTieu12Thang: 8_000_000,
  tenHangKeTiep: 'Kim cương',
  conThieu: 7_000_000,
  phieuChuaDung: [],
};

const BAN: TableSession = {
  sessionId: 'ts_1',
  tableSessionToken: 'tok',
  tableCode: 'T01',
  qrToken: 'cmc-table-t01-qr',
} as unknown as TableSession;

function apiVoi(ghiDe: Partial<LoyaltyApi> = {}): LoyaltyApi {
  return {
    cuaToi: async () => DIEM,
    noiSo: async () => DIEM,
    doiDiem: async () => {
      throw new Error('không dùng tới');
    },
    ...ghiDe,
  };
}

function banVoi(ghiDe: Partial<MoLaiPhien> = {}): MoLaiPhien {
  return { moPhien: async () => BAN, ...ghiDe };
}

describe('đồng bộ tài khoản', () => {
  it('đọc được số điện thoại — thứ đi kèm đơn và quyết định có tích điểm hay không', async () => {
    const kq = await dongBoTaiKhoan(apiVoi(), banVoi(), 'jwt', BAN);

    expect(kq.soDienThoai).toBe('0901234567');
  });

  it('MỞ LẠI phiên bàn để gắn tài khoản', async () => {
    // Đây là nửa thứ hai của bản sửa. Không mở lại thì phiên vĩnh viễn không có chủ, và đơn của
    // lần ghé này không hiện trong "Đơn của tôi" — backend chỉ gắn lúc mở phiên.
    let daMoLai: string | null = null;
    const kq = await dongBoTaiKhoan(
      apiVoi(),
      banVoi({
        moPhien: async (qrToken: string) => {
          daMoLai = qrToken;
          return BAN;
        },
      }),
      'jwt',
      BAN,
    );

    expect(daMoLai).toBe('cmc-table-t01-qr');
    expect(kq.phienBan).toBe(BAN);
  });

  it('chưa đăng nhập thì KHÔNG gọi gì cả và số điện thoại là null', async () => {
    let daGoiDiem = false;
    let daMoLai = false;
    const kq = await dongBoTaiKhoan(
      apiVoi({
        cuaToi: async () => {
          daGoiDiem = true;
          return DIEM;
        },
      }),
      banVoi({
        moPhien: async () => {
          daMoLai = true;
          return BAN;
        },
      }),
      null,
      BAN,
    );

    expect(daGoiDiem).toBe(false);
    expect(daMoLai).toBe(false);
    expect(kq.soDienThoai).toBeNull();
  });

  it('tài khoản chưa liên kết số thì trả null, KHÔNG phải lỗi', async () => {
    // Trạng thái bình thường của tài khoản mới. Coi là lỗi sẽ chặn khách gọi món.
    const kq = await dongBoTaiKhoan(
      apiVoi({ cuaToi: async () => ({ ...DIEM, linked: false, phoneNumber: null }) }),
      banVoi(),
      'jwt',
      BAN,
    );

    expect(kq.soDienThoai).toBeNull();
  });

  it('đọc điểm hỏng thì VẪN mở lại phiên, không bỏ dở nửa chừng', async () => {
    // Hai việc độc lập nhau. Để một lượt gọi hỏng nuốt luôn việc kia là biến một sự cố mạng
    // thoáng qua thành một phiên vĩnh viễn không có chủ.
    let daMoLai = false;
    const kq = await dongBoTaiKhoan(
      apiVoi({
        cuaToi: async () => {
          throw new Error('mạng chập chờn');
        },
      }),
      banVoi({
        moPhien: async () => {
          daMoLai = true;
          return BAN;
        },
      }),
      'jwt',
      BAN,
    );

    expect(daMoLai).toBe(true);
    expect(kq.soDienThoai).toBeNull();
  });

  it('mở lại phiên hỏng thì giữ phiên cũ, khách vẫn gọi món được', async () => {
    const kq = await dongBoTaiKhoan(
      apiVoi(),
      banVoi({
        moPhien: async () => {
          throw new Error('máy chủ bận');
        },
      }),
      'jwt',
      BAN,
    );

    expect(kq.phienBan).toBe(BAN);
    expect(kq.soDienThoai).toBe('0901234567');
  });

  it('chưa vào bàn thì chỉ đọc số điện thoại', async () => {
    let daMoLai = false;
    const kq = await dongBoTaiKhoan(
      apiVoi(),
      banVoi({
        moPhien: async () => {
          daMoLai = true;
          return BAN;
        },
      }),
      'jwt',
      null,
    );

    expect(daMoLai).toBe(false);
    expect(kq.soDienThoai).toBe('0901234567');
    expect(kq.phienBan).toBeNull();
  });
});
