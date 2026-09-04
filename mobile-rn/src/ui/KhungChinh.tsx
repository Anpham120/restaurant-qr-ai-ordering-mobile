import { type ReactElement, useMemo, useState } from 'react';
import { type GuiMaOtp } from '../core/auth/phoneOtp';
import { Text, TouchableOpacity, View } from 'react-native';

import { type AuthSession } from '../core/auth/authSession';
import { type CartApi } from '../core/cart/cartApi';
import { type CauHinhMayChu } from '../core/cauHinh/cauHinh';
import { type LoyaltyApi } from '../core/loyalty/loyaltyApi';
import { type MenuApi } from '../core/menu/menuApi';
import { type CreateOrderApi } from '../core/orders/createOrderApi';
import { type FavouriteApi } from '../core/orders/favouriteApi';
import { type OrderApi } from '../core/orders/orderApi';
import { type OrderHistoryApi } from '../core/orders/orderHistoryApi';
import { type OrderTokenStore } from '../core/orders/orderTokenStore';
import { type InvoiceApi } from '../core/payment/invoiceApi';
import { type PromotionApi } from '../core/promotions/promotionApi';
import { type TableSession } from '../core/tables/tableSession';
import { AccountTab } from './AccountTab';
import { CartScreen } from './CartScreen';
import { MenuScreen } from './MenuScreen';
import { OrdersScreen } from './OrdersScreen';
import { PromotionsScreen } from './PromotionsScreen';
import { MauQuan } from './theme';

export interface KhungChinhProps {
  /**
   * Gửi mã OTP, chuyển thẳng xuống chỗ liên kết số ở tab Tài khoản.
   *
   * `undefined` khi thư viện native vắng mặt (Expo Go).
   */
  guiMaOtp: GuiMaOtp | undefined;
  cauHinh: CauHinhMayChu;
  phienBan: TableSession;
  dangNhap: AuthSession | null;
  soDienThoai: string | null;
  menuApi: MenuApi;
  cartApi: CartApi;
  createOrderApi: CreateOrderApi;
  orderApi: OrderApi;
  promotionApi: PromotionApi;
  invoiceApi: InvoiceApi;
  historyApi: OrderHistoryApi;
  favouriteApi: FavouriteApi;
  loyaltyApi: LoyaltyApi;
  tokenStore: OrderTokenStore;
  onMoCaiDat: () => void;
  onRoiBan: () => void;
  onDangNhap: () => void;
  onDangXuat: () => void;
  onBaoTin?: ((tin: string) => void) | undefined;
  onNoiSoXong?: ((soMoi: string | null) => void) | undefined;
}

/** Một tab: nhãn và màn hình đi liền nhau trong CÙNG một phần tử. */
export interface Tab {
  readonly khoa: string;
  readonly nhan: string;
  readonly man: () => ReactElement;
}

/**
 * Khung chính sau khi đã vào bàn.
 *
 * <h2>Vì sao nhãn và màn hình nằm trong CÙNG một phần tử</h2>
 *
 * Bản Flutter giữ hai danh sách song song — `final man = [...]` và `destinations: [...]` — rồi
 * tra màn hình theo CHỈ SỐ của tab. Lỗi đã xảy ra thật: danh sách màn hình có 6 phần tử, danh
 * sách tab chỉ có 4, và Flutter không báo gì cả. Mỗi tab mở ra một màn hình lệch chỗ:
 *
 *     bấm "Đơn"        → hiện Giỏ hàng
 *     bấm "Khuyến mãi" → hiện Đơn bàn T01
 *     bấm "Tài khoản"  → hiện Trợ lý
 *
 * Nó lên tới máy thật và chỉ bị phát hiện bằng mắt qua ảnh chụp. 198 ca kiểm lúc đó đều xanh, vì
 * không ca nào đếm hai danh sách.
 *
 * Bản Flutter chữa bằng một ca kiểm ĐẾM hai danh sách (`dieu_huong_test.dart`). Bản này chữa bằng
 * cách bỏ hẳn danh sách thứ hai: một mảng `Tab`, mỗi phần tử mang cả nhãn lẫn hàm dựng màn hình.
 * Không còn hai thứ để lệch nhau, nên lỗi đó không còn TỒN TẠI ĐƯỢC — thay vì tồn tại được nhưng
 * bị canh.
 *
 * Ca kiểm tương đương vẫn giữ, nhưng nó kiểm điều KHÁC: mỗi tab bấm vào phải mở ra đúng màn hình
 * của chính nó.
 */
export function KhungChinh(p: KhungChinhProps) {
  const [khoaTab, setKhoaTab] = useState('thucDon');

  /** Thêm món vào giỏ, dùng chung cho trợ lý và cho "đặt lại đơn cũ". */
  const themVaoGio = useMemo(
    () => (menuItemId: string, quantity: number) =>
      p.cartApi
        .doiSoLuong(p.phienBan.sessionId, p.phienBan.tableSessionToken, menuItemId, quantity)
        .then(() => undefined),
    [p.cartApi, p.phienBan],
  );

  const tabs: readonly Tab[] = useMemo(
    () => [
      {
        khoa: 'thucDon',
        nhan: 'Thực đơn',
        man: () => (
          <MenuScreen
            api={p.menuApi}
            imageBaseUrl={p.cauHinh.imageBaseUrl}
            onBaoTin={p.onBaoTin}
            onThemVaoGio={(menuItemId) => themVaoGio(menuItemId, 1)}
          />
        ),
      },
      {
        khoa: 'gio',
        nhan: 'Giỏ',
        man: () => (
          <CartScreen
            cartApi={p.cartApi}
            createOrderApi={p.createOrderApi}
            onDatXong={(don) => {
              // Cất X-Order-Token NGAY: backend chỉ trả nó một lần, và mất nó là mất quyền huỷ
              // món của chính mình (#11).
              void p.tokenStore.luu(don.orderCode, don.customerAccessToken).then(() => {
                p.onBaoTin?.(`Đã gửi bếp — đơn ${don.orderCode}`);
                setKhoaTab('don');
              });
            }}
            phienBan={p.phienBan}
            soDienThoai={p.soDienThoai}
          />
        ),
      },
      {
        khoa: 'don',
        nhan: 'Đơn',
        man: () => (
          <OrdersScreen api={p.orderApi} phienBan={p.phienBan} tokenStore={p.tokenStore} />
        ),
      },
      {
        khoa: 'khuyenMai',
        nhan: 'Khuyến mãi',
        man: () => <PromotionsScreen api={p.promotionApi} />,
      },
      {
        khoa: 'taiKhoan',
        nhan: 'Tài khoản',
        man: () => (
          <AccountTab
            guiMaOtp={p.guiMaOtp}
            onNoiSoXong={p.onNoiSoXong}
            promotionApi={p.promotionApi}
            orderApi={p.orderApi}
            cauHinh={p.cauHinh}
            dangNhap={p.dangNhap}
            favouriteApi={p.favouriteApi}
            historyApi={p.historyApi}
            invoiceApi={p.invoiceApi}
            loyaltyApi={p.loyaltyApi}
            onBaoTin={p.onBaoTin}
            onDangNhap={p.onDangNhap}
            onDangXuat={p.onDangXuat}
            onMoCaiDat={p.onMoCaiDat}
            onRoiBan={p.onRoiBan}
            phienBan={p.phienBan}
            soDienThoai={p.soDienThoai}
            themVaoGio={themVaoGio}
          />
        ),
      },
    ],
    [p, themVaoGio],
  );

  const dangMo = tabs.find((t) => t.khoa === khoaTab) ?? tabs[0]!;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{dangMo.man()}</View>
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: MauQuan.clayLine,
          backgroundColor: MauQuan.trang,
        }}
      >
        {tabs.map((t) => (
          <TouchableOpacity
            accessibilityLabel={t.nhan}
            accessibilityRole="tab"
            accessibilityState={{ selected: t.khoa === khoaTab }}
            key={t.khoa}
            onPress={() => setKhoaTab(t.khoa)}
            style={{ flex: 1, paddingVertical: 10, alignItems: 'center' }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: t.khoa === khoaTab ? '700' : '500',
                color: t.khoa === khoaTab ? MauQuan.chestnut : MauQuan.muted,
              }}
            >
              {t.nhan}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
