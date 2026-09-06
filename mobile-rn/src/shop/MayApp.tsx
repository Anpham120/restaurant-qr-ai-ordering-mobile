import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AccountScreen, SettingsScreen } from './AccountScreen';
import { CartScreen } from './CartScreen';
import { CourierScreen } from './CourierScreen';
import { MenuScreen } from './MenuScreen';
import { HistoryScreen, OrderScreen } from './OrderScreen';
import { ShopApi } from './client';
import { addToCart, apiUrl, errorMessage } from './logic';
import { shopStorage } from './storage';
import type { CartLine, Menu, Order, OrderReference, Session, ShopConfig } from './types';
import { Button, NavMark, color, s } from './ui';

type Tab = 'menu' | 'cart' | 'orders' | 'account';
const tabs: { id: Tab; label: string }[] = [
  { id: 'menu', label: 'Thực đơn' },
  { id: 'cart', label: 'Giỏ hàng' },
  { id: 'orders', label: 'Đơn của tôi' },
  { id: 'account', label: 'Tài khoản' },
];
export function MayApp() {
  const [origin, setOrigin] = useState('');
  const [restored, setRestored] = useState(false);
  const [scopeReady, setScopeReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('menu');
  const [settings, setSettings] = useState(false);
  const [courier, setCourier] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [notice, setNotice] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [history, setHistory] = useState<OrderReference[]>([]);
  const [tracking, setTracking] = useState<{
    reference: OrderReference;
    method: 'VietQR' | 'COD' | null;
  } | null>(null);
  const api = useMemo(
    () => new ShopApi(origin, session?.accessToken),
    [origin, session?.accessToken],
  );
  const cartWrites = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void shopStorage
      .origin()
      .then((stored) => {
        if (active) {
          const configured = stored || process.env.EXPO_PUBLIC_API_BASE_URL || '';
          setOrigin(configured ? apiUrl(configured) : '');
        }
      })
      .catch((cause) => setNotice(errorMessage(cause)))
      .finally(() => {
        if (active) setRestored(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!origin) return;
    let active = true;
    void Promise.all([
      shopStorage.session(origin),
      shopStorage.cart(origin),
      shopStorage.history(origin),
    ])
      .then(([savedSession, savedCart, savedHistory]) => {
        if (!active) return;
        setSession(savedSession);
        setCart(savedCart);
        setHistory(savedHistory);
        setCourier(savedSession?.user.role === 'Courier');
      })
      .catch((cause) => {
        if (active) setNotice(errorMessage(cause));
      })
      .finally(() => {
        if (active) setScopeReady(true);
      });
    return () => {
      active = false;
    };
  }, [origin]);
  const refresh = useCallback(async () => {
    if (!origin) return;
    setLoading(true);
    const results = await Promise.allSettled([api.menu(), api.config()]);
    const [menuResult, configResult] = results;
    if (menuResult.status === 'fulfilled') setMenu(menuResult.value);
    if (configResult.status === 'fulfilled') setConfig(configResult.value);
    setMenuError(
      [
        ...new Set(
          results
            .filter((result) => result.status === 'rejected')
            .map((result) => errorMessage(result.reason)),
        ),
      ].join('\n'),
    );
    setLoading(false);
  }, [origin, api]);
  useEffect(() => {
    const initial = setTimeout(() => {
      if (scopeReady) void refresh();
    }, 0);
    return () => clearTimeout(initial);
  }, [scopeReady, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (placingOrder) return true;
      if (tracking) {
        setTracking(null);
        setTab('orders');
        return true;
      }
      if (settings) {
        setSettings(false);
        return true;
      }
      if (courier) {
        setCourier(false);
        setTab('account');
        return true;
      }
      if (tab !== 'menu') {
        setTab('menu');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [tracking, settings, courier, tab, placingOrder]);
  useEffect(() => {
    const open = (url: string) => {
      const match = url.match(/(?:order|orders)\/([^/?#]+)/);
      if (!match?.[1]) return;
      let code: string;
      try {
        code = decodeURIComponent(match[1]);
      } catch {
        setNotice('Đường dẫn đơn không hợp lệ.');
        return;
      }
      const reference = history.find((item) => item.orderCode === code);
      if (reference) {
        setTracking({ reference, method: null });
        setTab('orders');
      } else setNotice('Thiết bị này chưa có quyền truy cập đơn được mở.');
    };
    const subscription = Linking.addEventListener('url', (event) => open(event.url));
    if (scopeReady)
      void Linking.getInitialURL()
        .then((url) => {
          if (url) open(url);
        })
        .catch(() => undefined);
    return () => subscription.remove();
  }, [history, scopeReady]);
  const changeCart = (next: CartLine[]) => {
    setCart(next);
    cartWrites.current = cartWrites.current
      .then(() => shopStorage.saveCart(origin, next))
      .catch((cause) => setNotice(`Chưa lưu được giỏ trên thiết bị: ${errorMessage(cause)}`));
  };
  const created = async (order: Order, method: 'VietQR' | 'COD') => {
    if (!order.customerAccessToken)
      throw new Error(
        `Đơn ${order.orderCode} đã tạo nhưng thiếu mã truy cập. Liên hệ quán, không đặt lại đơn.`,
      );
    const reference = {
      orderCode: order.orderCode,
      token: order.customerAccessToken,
      createdAt: order.createdAt ?? new Date().toISOString(),
      paymentMethod: method,
    };
    const next = [
      reference,
      ...history.filter((item) => item.orderCode !== reference.orderCode),
    ].slice(0, 40);
    await shopStorage.saveHistory(origin, next);
    setHistory(next);
    changeCart([]);
    setTracking({ reference, method });
    setTab('orders');
  };
  const signIn = async (next: Session) => {
    await shopStorage.saveSession(origin, next);
    setSession(next);
    setCourier(next.user.role === 'Courier');
    setNotice('Đăng nhập thành công.');
  };
  const signOut = async () => {
    await Promise.all([shopStorage.clearSession(origin), shopStorage.clearHistory(origin)]);
    setSession(null);
    setHistory([]);
    setTracking(null);
    setCourier(false);
    changeCart([]);
  };
  const saveOrigin = async (next: string) => {
    await shopStorage.saveOrigin(next);
    if (next !== origin) {
      setMenu(null);
      setConfig(null);
      setMenuError('');
      setSession(null);
      setCart([]);
      setHistory([]);
      setTracking(null);
      setCourier(false);
      setScopeReady(false);
    }
    setOrigin(next);
    setSettings(false);
    setTab('menu');
  };
  const navigate = (next: Tab) => {
    setTracking(null);
    setTab(next);
  };
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  let content;
  if (!restored || (origin && !scopeReady))
    content = (
      <View style={[s.content, { flex: 1, justifyContent: 'center' }]}>
        <Text style={s.brand}>Mây</Text>
        <ActivityIndicator color={color.forest} />
        <Text style={s.body}>Đang chuẩn bị một ngày ngọt ngào…</Text>
      </View>
    );
  else if (!origin || settings)
    content = (
      <SettingsScreen
        origin={origin}
        onSave={saveOrigin}
        {...(origin ? { onBack: () => setSettings(false) } : {})}
      />
    );
  else if (courier && session?.user.role === 'Courier')
    content = (
      <CourierScreen
        api={api}
        session={session}
        onAccount={() => {
          setCourier(false);
          setTab('account');
        }}
      />
    );
  else if (tracking)
    content = (
      <OrderScreen
        key={tracking.reference.orderCode}
        api={api}
        reference={tracking.reference}
        initialMethod={tracking.method}
        onBack={() => {
          setTracking(null);
          setTab('orders');
        }}
      />
    );
  else if (tab === 'cart')
    content = (
      <CartScreen
        cart={cart}
        onChange={changeCart}
        onMenu={() => setTab('menu')}
        api={api}
        config={config}
        menu={menu}
        onCreated={created}
        onSubmitting={setPlacingOrder}
        onCatalog={(nextMenu, nextConfig) => {
          setMenu(nextMenu);
          setConfig(nextConfig);
        }}
      />
    );
  else if (tab === 'orders')
    content = (
      <HistoryScreen
        api={api}
        history={history}
        onOpen={(reference) => setTracking({ reference, method: reference.paymentMethod ?? null })}
        onMenu={() => setTab('menu')}
      />
    );
  else if (tab === 'account')
    content = (
      <AccountScreen
        api={api}
        session={session}
        config={config}
        onSession={signIn}
        onLogout={signOut}
        onSettings={() => setSettings(true)}
        onCourier={() => setCourier(true)}
      />
    );
  else
    content = (
      <MenuScreen
        menu={menu}
        config={config}
        origin={origin}
        onAdd={(product, ids, quantity, note) => {
          changeCart(addToCart(cart, product, ids, quantity, note));
          setNotice(`Đã thêm ${quantity} ${product.name} vào giỏ.`);
        }}
        loading={loading}
        error={menuError}
        onRefresh={() => void refresh()}
      />
    );
  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <View style={[s.between, s.topBar]}>
        <Text style={s.brand}>Mây</Text>
        <Text style={s.label}>{courier ? 'GIAO HÀNG NỘI BỘ' : 'NƯỚC · KEM · CHÈ'}</Text>
      </View>
      {content}
      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            padding: 12,
            marginHorizontal: 16,
            borderRadius: 12,
            backgroundColor: color.pistachio,
          }}
        >
          <Text style={s.body}>{notice}</Text>
          <Button tone="quiet" onPress={() => setNotice('')}>
            Đóng thông báo
          </Button>
        </View>
      ) : null}
      {origin && scopeReady && !settings && !courier ? (
        <View style={s.tabs}>
          {tabs.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              disabled={placingOrder}
              accessibilityState={{ selected: tab === item.id }}
              accessibilityLabel={`${item.label}${item.id === 'cart' ? `, ${cartCount} phần` : ''}`}
              onPress={() => navigate(item.id)}
              style={({ pressed }) => [
                s.tab,
                tab === item.id && s.tabSelected,
                pressed && s.pressed,
              ]}
            >
              <NavMark kind={item.id} />
              <Text style={[s.navLabel, tab === item.id && { color: color.forest }]}>
                {item.label}
                {item.id === 'cart' && cartCount > 0 ? ` (${cartCount})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
