import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { type AuthSession } from '../core/auth/authSession';
import { type CauHinhMayChu } from '../core/cauHinh/cauHinh';
import { type LoyaltyApi } from '../core/loyalty/loyaltyApi';
import { type FavouriteApi } from '../core/orders/favouriteApi';
import { type OrderHistoryApi } from '../core/orders/orderHistoryApi';
import { type InvoiceApi } from '../core/payment/invoiceApi';
import { type TableSession } from '../core/tables/tableSession';
import { HistoryScreen } from './HistoryScreen';
import { LoyaltyScreen } from './LoyaltyScreen';
import { PaymentScreen } from './PaymentScreen';
import { MauQuan, kieuChung } from './theme';

export interface AccountTabProps {
  phienBan: TableSession;
  dangNhap: AuthSession | null;
  cauHinh: CauHinhMayChu;
  soDienThoai: string | null;
  invoiceApi: InvoiceApi;
  historyApi: OrderHistoryApi;
  favouriteApi: FavouriteApi;
  loyaltyApi: LoyaltyApi;
  themVaoGio: (menuItemId: string, quantity: number) => Promise<void>;
  onMoCaiDat: () => void;
  onRoiBan: () => void;
  onDangNhap: () => void;
  onDangXuat: () => void;
  onBaoTin?: ((tin: string) => void) | undefined;
}

/** Màn con mở từ tab tài khoản. `null` là đang ở danh sách gốc. */
type ManCon = 'thanhToan' | 'lichSu' | 'diem' | null;

function Dong({ tieuDe, phu, onPress }: { tieuDe: string; phu?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityLabel={tieuDe}
      accessibilityRole="button"
      onPress={onPress}
      style={kieuChung.the}
    >
      <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>{tieuDe}</Text>
      {phu !== undefined ? <Text style={kieuChung.chuPhu}>{phu}</Text> : null}
    </TouchableOpacity>
  );
}

/** Tab tài khoản: trạng thái bàn, đăng nhập/đăng xuất, và điểm thưởng khi đã đăng nhập. */
export function AccountTab(p: AccountTabProps) {
  const [manCon, setManCon] = useState<ManCon>(null);
  const ses = p.dangNhap;

  if (manCon === 'thanhToan') {
    return (
      <ManConCoNutVe onVe={() => setManCon(null)}>
        <PaymentScreen
          api={p.invoiceApi}
          onBaoTin={p.onBaoTin}
          phienBan={p.phienBan}
          soDienThoai={p.soDienThoai}
        />
      </ManConCoNutVe>
    );
  }

  if (manCon === 'lichSu' && ses !== null) {
    return (
      <ManConCoNutVe onVe={() => setManCon(null)}>
        <HistoryScreen
          accessToken={ses.accessToken}
          favouriteApi={p.favouriteApi}
          historyApi={p.historyApi}
          onBaoTin={p.onBaoTin}
          themVaoGio={p.themVaoGio}
        />
      </ManConCoNutVe>
    );
  }

  if (manCon === 'diem' && ses !== null) {
    return (
      <ManConCoNutVe onVe={() => setManCon(null)}>
        <LoyaltyScreen accessToken={ses.accessToken} api={p.loyaltyApi} onBaoTin={p.onBaoTin} />
      </ManConCoNutVe>
    );
  }

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={kieuChung.tieuDe}>Tài khoản</Text>

      <View style={kieuChung.the}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
          Bàn {p.phienBan.tableCode}
        </Text>
        <Text style={kieuChung.chuPhu}>{p.phienBan.tableDisplayName}</Text>
        <TouchableOpacity
          accessibilityLabel="Rời bàn"
          accessibilityRole="button"
          onPress={p.onRoiBan}
          style={[kieuChung.nutVien, { marginTop: 8 }]}
        >
          <Text style={kieuChung.chuNutVien}>Rời bàn</Text>
        </TouchableOpacity>
      </View>

      <Dong
        onPress={() => setManCon('thanhToan')}
        phu="Xem hoá đơn và chọn cách trả tiền"
        tieuDe="Thanh toán"
      />
      <Dong onPress={p.onMoCaiDat} phu={p.cauHinh.apiBaseUrl} tieuDe="Máy chủ" />

      {ses === null ? (
        <View style={kieuChung.the}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
            Khách vãng lai
          </Text>
          <Text style={kieuChung.chuPhu}>Đăng nhập để tích điểm và xem ưu đãi riêng</Text>
          <TouchableOpacity
            accessibilityLabel="Đăng nhập"
            accessibilityRole="button"
            onPress={p.onDangNhap}
            style={[kieuChung.nutChinh, { marginTop: 8 }]}
          >
            <Text style={kieuChung.chuNutChinh}>Đăng nhập</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={kieuChung.the}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
              {ses.user.fullName}
            </Text>
            <Text style={kieuChung.chuPhu}>{ses.user.email}</Text>
            <TouchableOpacity
              accessibilityLabel="Đăng xuất"
              accessibilityRole="button"
              onPress={p.onDangXuat}
              style={[kieuChung.nutVien, { marginTop: 8 }]}
            >
              <Text style={kieuChung.chuNutVien}>Đăng xuất</Text>
            </TouchableOpacity>
          </View>
          <Dong
            onPress={() => setManCon('lichSu')}
            phu="Đơn của những lần ghé trước"
            tieuDe="Lịch sử đơn"
          />
          <Dong
            onPress={() => setManCon('diem')}
            phu="Xem điểm và đổi ưu đãi"
            tieuDe="Điểm thưởng"
          />
        </>
      )}
    </ScrollView>
  );
}

function ManConCoNutVe({ children, onVe }: { children: React.ReactNode; onVe: () => void }) {
  return (
    <View style={kieuChung.man}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: MauQuan.clayLine }}>
        <TouchableOpacity
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
          onPress={onVe}
          style={{ alignSelf: 'flex-start' }}
        >
          <Text style={kieuChung.chuNutVien}>‹ Quay lại</Text>
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}
