import { ScrollView, Text, View } from 'react-native';

import { type AuthSession, danhTinh } from '../core/auth/authSession';
import { type LoyaltyApi } from '../core/loyalty/loyaltyApi';
import { LienKetSoDienThoai } from './LienKetSoDienThoai';
import { MauQuan, kieuChung } from './theme';

export interface HoSoTaiKhoanProps {
  dangNhap: AuthSession;
  api: LoyaltyApi;
  /** Số đã liên kết, `null` nếu chưa. */
  soDienThoai: string | null;
  onNoiSoXong: (soMoi: string | null) => void;
  onBaoTin?: ((tin: string) => void) | undefined;
  /** Gọi sau khi nối xong, để màn cha đóng lại. */
  onXong?: (() => void) | undefined;
}

/**
 * Hồ sơ tài khoản: tên, email, và số điện thoại dùng để tích điểm.
 *
 * Đứng RIÊNG khỏi tab Tài khoản vì tab đó nằm trong {@code KhungChinh}, thứ chỉ tồn tại khi đã mở
 * một phiên bàn. Nếu hồ sơ chỉ sống ở đó thì khách tạo tài khoản ở nhà sẽ không liên kết được số
 * cho tới khi quét QR ngồi vào bàn — trong khi liên kết đúng là việc họ muốn làm ngay sau khi
 * đăng ký, và chẳng dính gì tới bàn nào cả.
 */
export function HoSoTaiKhoan(p: HoSoTaiKhoanProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} style={kieuChung.man}>
      <Text style={kieuChung.tieuDe}>Hồ sơ tài khoản</Text>

      <View style={[kieuChung.the, { gap: 4 }]}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
          {p.dangNhap.user.fullName}
        </Text>
        <Text style={kieuChung.chuPhu}>{danhTinh(p.dangNhap.user)}</Text>
      </View>

      {p.soDienThoai === null ? (
        <LienKetSoDienThoai
          accessToken={p.dangNhap.accessToken}
          api={p.api}
          onLoiNang={(loi) => {
            throw loi;
          }}
          onNoiXong={(diem) => {
            p.onNoiSoXong(diem.linked ? diem.phoneNumber : null);
            p.onBaoTin?.('Đã liên kết số điện thoại.');
            p.onXong?.();
          }}
        />
      ) : (
        <View style={[kieuChung.the, { gap: 4 }]}>
          <Text style={kieuChung.nhan}>Số điện thoại</Text>
          <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
            {p.soDienThoai}
          </Text>
          {/* Nói rõ số này DÙNG để làm gì, thay vì chỉ trưng ra một dãy số. */}
          <Text style={kieuChung.chuPhu}>Điểm thưởng cộng vào số này mỗi lần bạn thanh toán.</Text>
        </View>
      )}
    </ScrollView>
  );
}
