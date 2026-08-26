import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
// SafeAreaView của react-native là NO-OP trên Android: nó chỉ chừa lề trên iOS. Trên máy Android
// thật, tiêu đề mọi màn hình bị thanh trạng thái đè lên — và jest render vào cây ảo nên không có
// thanh nào để đè, phép kiểm nào cũng xanh. Bản của react-native-safe-area-context đọc lề thật từ
// hệ điều hành ở cả hai nền tảng, và là thứ Expo khuyến nghị.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { HttpAuthApi } from './src/core/auth/authApi';
import { AuthRepository } from './src/core/auth/authRepository';
import { type AuthSession } from './src/core/auth/authSession';
import { SecureTokenStore } from './src/core/auth/tokenStore';
import { HttpCartApi } from './src/core/cart/cartApi';
import { type CauHinhMayChu } from './src/core/cauHinh/cauHinh';
import { CauHinhStore } from './src/core/cauHinh/cauHinhStore';
import { HttpChatApi } from './src/core/chat/chatApi';
import { dongBoTaiKhoan } from './src/core/loyalty/dongBoTaiKhoan';
import { HttpLoyaltyApi } from './src/core/loyalty/loyaltyApi';
import { HttpMenuApi } from './src/core/menu/menuApi';
import { HttpCreateOrderApi } from './src/core/orders/createOrderApi';
import { HttpFavouriteApi } from './src/core/orders/favouriteApi';
import { HttpOrderApi } from './src/core/orders/orderApi';
import { HttpOrderHistoryApi } from './src/core/orders/orderHistoryApi';
import { OrderTokenStore } from './src/core/orders/orderTokenStore';
import { HttpInvoiceApi } from './src/core/payment/invoiceApi';
import { HttpPromotionApi } from './src/core/promotions/promotionApi';
import { type TableSession } from './src/core/tables/tableSession';
import { HttpTableSessionApi } from './src/core/tables/tableSessionApi';
import { TableSessionRepository } from './src/core/tables/tableSessionRepository';
import { SecureTableSessionStore } from './src/core/tables/tableSessionStore';
import { KhungChinh } from './src/ui/KhungChinh';
import { LoginScreen } from './src/ui/LoginScreen';
import { OpenTableScreen } from './src/ui/OpenTableScreen';
import { ServerSettingsScreen } from './src/ui/ServerSettingsScreen';
import { MauQuan, kieuChung } from './src/ui/theme';

const cauHinhStore = new CauHinhStore();
const tokenStore = new SecureTokenStore();
const banStore = new SecureTableSessionStore();
const orderTokenStore = new OrderTokenStore();

/** Màn hình đang mở ở tầng ngoài cùng. */
type ManNgoai = 'caiDat' | 'dangNhap' | null;

/**
 * Dựng lại TOÀN BỘ client theo địa chỉ hiện tại.
 *
 * Mỗi client giữ `baseUrl` bên trong, nên đổi máy chủ bắt buộc phải dựng lại chúng — sửa một biến
 * dùng chung sẽ không chạm tới những client đã tạo, và app sẽ nửa nói chuyện với máy cũ nửa với
 * máy mới.
 */
function dungClient(cauHinh: CauHinhMayChu) {
  const api = cauHinh.apiBaseUrl;
  const auth = new AuthRepository(new HttpAuthApi(api), tokenStore);
  return {
    auth,
    ban: new TableSessionRepository(new HttpTableSessionApi(api), banStore, auth),
    menuApi: new HttpMenuApi(api),
    cartApi: new HttpCartApi(api),
    createOrderApi: new HttpCreateOrderApi(api),
    orderApi: new HttpOrderApi(api),
    chatApi: new HttpChatApi(api),
    promotionApi: new HttpPromotionApi(api),
    invoiceApi: new HttpInvoiceApi(api),
    historyApi: new HttpOrderHistoryApi(api),
    favouriteApi: new HttpFavouriteApi(api),
    loyaltyApi: new HttpLoyaltyApi(api),
  };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NoiDungApp />
    </SafeAreaProvider>
  );
}

function NoiDungApp() {
  const [cauHinh, setCauHinh] = useState<CauHinhMayChu | null>(null);
  const [dangNhap, setDangNhap] = useState<AuthSession | null>(null);
  const [phienBan, setPhienBan] = useState<TableSession | null>(null);
  const [soDienThoai, setSoDienThoai] = useState<string | null>(null);
  const [manNgoai, setManNgoai] = useState<ManNgoai>(null);
  const [tin, setTin] = useState<string | null>(null);
  const [dangKhoiPhuc, setDangKhoiPhuc] = useState(true);

  const client = useMemo(() => (cauHinh === null ? null : dungClient(cauHinh)), [cauHinh]);

  /**
   * Gọi luật ở {@link dongBoTaiKhoan} rồi đổ kết quả vào state.
   *
   * Luật nằm ở core chứ không ở đây, vì `App.tsx` không có phép kiểm nào — và đó chính là chỗ lỗi
   * "đơn không mang số điện thoại" đã sống suốt nhiều lượt xây tính năng mà không ai thấy.
   */
  const dongBo = useCallback(
    async (ses: AuthSession | null, ban: TableSession | null) => {
      if (client === null) return;
      const kq = await dongBoTaiKhoan(client.loyaltyApi, client.ban, ses?.accessToken ?? null, ban);
      setSoDienThoai(kq.soDienThoai);
      if (kq.phienBan !== null) setPhienBan(kq.phienBan);
    },
    [client],
  );

  // Khôi phục cấu hình, phiên đăng nhập và phiên bàn — theo đúng thứ tự đó, vì hai thứ sau cần
  // địa chỉ máy chủ mới đọc được.
  useEffect(() => {
    let huy = false;
    void (async () => {
      const ch = await cauHinhStore.doc();
      if (huy) return;
      setCauHinh(ch);
      setDangKhoiPhuc(false);
    })();
    return () => {
      huy = true;
    };
  }, []);

  useEffect(() => {
    if (client === null) return;
    let huy = false;
    void Promise.all([client.auth.khoiPhuc(), client.ban.khoiPhuc()]).then(([ses, ban]) => {
      if (huy) return;
      setDangNhap(ses);
      setPhienBan(ban);
      // Mở lại app cũng phải đồng bộ: số điện thoại KHÔNG được cất xuống máy, nên không khôi phục
      // được cùng hai thứ kia.
      void dongBo(ses, ban);
    });
    return () => {
      huy = true;
    };
    // `dongBo` chỉ đổi khi `client` đổi, nên thêm nó vào đây không làm effect chạy thêm lần nào.
  }, [client, dongBo]);

  const luuCauHinh = useCallback(async (moi: CauHinhMayChu) => {
    await cauHinhStore.luu(moi);
    // Đổi máy chủ thì token cũ vô nghĩa. Xoá hết thay vì để app gửi token của máy khác và nhận
    // 401 ở một chỗ ngẫu nhiên.
    await Promise.all([tokenStore.xoa(), banStore.xoa(), orderTokenStore.xoaHet()]);
    setDangNhap(null);
    setPhienBan(null);
    setCauHinh(moi);
    setManNgoai(null);
  }, []);

  const roiBan = useCallback(async () => {
    if (client === null) return;
    await client.ban.roiBan();
    // Token đơn của bàn cũ không dùng được nữa — không có lý do giữ.
    await orderTokenStore.xoaHet();
    setPhienBan(null);
  }, [client]);

  const dangXuat = useCallback(async () => {
    if (client === null) return;
    await client.auth.dangXuat();
    setDangNhap(null);
    setSoDienThoai(null);
  }, [client]);

  if (dangKhoiPhuc) {
    return (
      <SafeAreaView style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </SafeAreaView>
    );
  }

  // Chưa có địa chỉ máy chủ thì KHÔNG có gì để hiện: mọi màn hình khác đều bắt đầu bằng một lời
  // gọi mạng. Bắt nhập trước là trung thực hơn một màn hình trống kèm lỗi.
  if (cauHinh === null || client === null || manNgoai === 'caiDat') {
    return (
      <SafeAreaView style={kieuChung.man}>
        <StatusBar style="dark" />
        <ServerSettingsScreen
          batBuoc={cauHinh === null}
          hienTai={cauHinh ?? { apiBaseUrl: '', imageBaseUrl: '' }}
          onLuu={luuCauHinh}
        />
      </SafeAreaView>
    );
  }

  if (manNgoai === 'dangNhap') {
    return (
      <SafeAreaView style={kieuChung.man}>
        <StatusBar style="dark" />
        <LoginScreen
          onDangNhapXong={(ses) => {
            setDangNhap(ses);
            setManNgoai(null);
            // Đăng nhập GIỮA chừng phiên bàn là đường đi thường gặp nhất, vì app không cho đăng
            // nhập trước khi vào bàn.
            void dongBo(ses, phienBan);
          }}
          repository={client.auth}
        />
      </SafeAreaView>
    );
  }

  // KHÔNG bắt đăng nhập trước khi vào bàn. Khách vãng lai phải dùng được app đúng như web; đăng
  // nhập chỉ đổi lấy việc đơn được gắn tài khoản (§9.4).
  if (phienBan === null) {
    return (
      <SafeAreaView style={kieuChung.man}>
        <StatusBar style="dark" />
        <OpenTableScreen
          dangNhapVoi={dangNhap}
          onDangNhap={() => setManNgoai('dangNhap')}
          onMoPhienXong={(ban) => {
            setPhienBan(ban);
            // Phiên vừa mở đã kèm token nếu khách đã đăng nhập, nên chỉ cần đọc số điện thoại —
            // nhưng vẫn đi qua cùng một hàm để không có nhánh nào lệch luật với nhánh khác.
            void dongBo(dangNhap, null);
          }}
          repository={client.ban}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={kieuChung.man}>
      <StatusBar style="dark" />
      <KhungChinh
        cartApi={client.cartApi}
        cauHinh={cauHinh}
        chatApi={client.chatApi}
        createOrderApi={client.createOrderApi}
        dangNhap={dangNhap}
        favouriteApi={client.favouriteApi}
        historyApi={client.historyApi}
        invoiceApi={client.invoiceApi}
        loyaltyApi={client.loyaltyApi}
        menuApi={client.menuApi}
        onBaoTin={setTin}
        onDangNhap={() => setManNgoai('dangNhap')}
        onDangXuat={() => void dangXuat()}
        onMoCaiDat={() => setManNgoai('caiDat')}
        onRoiBan={() => void roiBan()}
        orderApi={client.orderApi}
        phienBan={phienBan}
        promotionApi={client.promotionApi}
        soDienThoai={soDienThoai}
        tokenStore={orderTokenStore}
      />
      {/*
        Dải báo tin đơn giản thay cho ScaffoldMessenger của Flutter. React Native không có thứ
        tương đương sẵn có, và mọi màn hình đã đẩy lời báo ra ngoài qua onBaoTin — nên chỗ hiển
        thị nằm đúng ở đây, một lần cho cả app.
      */}
      {tin !== null ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 72,
            backgroundColor: MauQuan.ink,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text
            accessibilityLabel="Thông báo"
            onPress={() => setTin(null)}
            style={{ color: MauQuan.trang }}
          >
            {tin}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
