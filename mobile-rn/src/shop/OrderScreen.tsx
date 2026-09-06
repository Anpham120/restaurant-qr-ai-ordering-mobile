import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Linking, ScrollView, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ShopApi } from './client';
import { errorMessage, isPaid, money, paymentLabel, statusLabel } from './logic';
import type { Order, OrderReference, Payment } from './types';
import { Button, Empty, Message, color, s } from './ui';

export function OrderScreen({
  api,
  reference,
  initialMethod,
  onBack,
}: {
  api: ShopApi;
  reference: OrderReference;
  initialMethod: 'VietQR' | 'COD' | null;
  onBack: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [notice, setNotice] = useState('');
  const initialRequested = useRef(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const current = await api.order(reference.orderCode, reference.token);
      setOrder(current);
      setPollError('');
    } catch (cause) {
      setPollError(errorMessage(cause));
    } finally {
      inFlight.current = false;
    }
  }, [api, reference]);
  const pay = useCallback(
    async (method: 'VietQR' | 'COD') => {
      setBusy(true);
      setError('');
      try {
        setPayment(
          await api.requestPayment(
            reference.orderCode,
            reference.token,
            method,
            `mobile-payment-${reference.orderCode}-${method}`,
          ),
        );
        await refresh();
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setBusy(false);
      }
    },
    [api, reference, refresh],
  );
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState === null) void refresh();
    }, 8000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);
  useEffect(() => {
    if (!order || initialRequested.current) return;
    initialRequested.current = true;
    if (isPaid(order.paymentStatus) || order.status === 'Cancelled') return;
    if (initialMethod && (order.paymentMethod === 'Unselected' || order.paymentStatus === 'NotRequested')) {
      const initial = setTimeout(() => void pay(initialMethod), 0);
      return () => clearTimeout(initial);
    }
    if (order.paymentMethod === 'VietQR') {
      void api.payment(reference.orderCode, reference.token).then(setPayment).catch(cause => setError(errorMessage(cause)));
    }
  }, [initialMethod, pay, order, api, reference]);
  const paid = isPaid(order?.paymentStatus);
  const cod = order?.paymentMethod === 'COD' || payment?.payment?.method === 'COD';
  const stage =
    order?.fulfillmentStatus && !['Unassigned', 'Assigned'].includes(order.fulfillmentStatus)
      ? order.fulfillmentStatus
      : order?.status;
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.between}>
        <Text style={s.label}>03 / THEO DÕI ĐƠN</Text>
        <Button tone="quiet" onPress={onBack}>
          Đơn của tôi
        </Button>
      </View>
      <Text style={s.title}>Mây đã nhận{'\n'}lời nhắn của bạn.</Text>
      <View style={[s.card, { backgroundColor: color.forest, borderWidth: 0 }]}>
        <Text style={[s.small, { color: color.pistachio }]}>MÃ ĐƠN</Text>
        <Text selectable style={[s.heading, { color: color.white }]}>
          {reference.orderCode}
        </Text>
        <Text style={[s.heading, { color: color.cream }]}>
          {order ? statusLabel(stage) : 'Đang cập nhật…'}
        </Text>
        <Text style={[s.body, { color: color.pistachio }]}>
          {cod && !paid
            ? order?.codAccepted
              ? 'Quán đã xác nhận đơn tiền mặt.'
              : 'Đơn tiền mặt đang chờ quán xác nhận.'
            : paid
              ? 'Thanh toán đã được xác nhận.'
              : 'Quán sẽ bắt đầu chuẩn bị sau khi xác nhận thanh toán.'}
        </Text>
      </View>
      {error ? <Message error>{error}</Message> : null}
      {pollError ? <Message error>{pollError}</Message> : null}
      {notice ? <Message>{notice}</Message> : null}
      {order ? (
        <>
          <View style={s.card}>
            <View style={s.between}>
              <Text style={s.heading}>
                {paid ? 'Đã thanh toán' : cod ? 'Số tiền cần trả' : 'Cần thanh toán'}
              </Text>
              <Text style={s.heading}>{money(order.totalAmount)}</Text>
            </View>
            <Text style={s.small}>
              {paymentLabel(order.paymentStatus)} ·{' '}
              {statusLabel(
                order.paymentMethod === 'Unselected'
                  ? payment?.payment?.method
                  : order.paymentMethod,
              )}
            </Text>
            {cod && !paid ? (
              <Text style={s.body}>
                {order.orderType === 'Delivery'
                  ? 'Trả tiền mặt cho nhân viên giao hàng khi nhận đủ món.'
                  : 'Thanh toán tiền mặt tại quầy khi nhận món.'}
              </Text>
            ) : null}
          </View>
          {!paid && order.status !== 'Cancelled' && !cod ? (
            <View style={s.card}>
              <Text style={s.heading}>Chuyển khoản VietQR</Text>
              {payment?.vietQr ? (
                <>
                  <Image
                    accessibilityLabel="Mã VietQR thanh toán đơn hàng"
                    resizeMode="contain"
                    source={{ uri: payment.vietQr.qrImageDataUri || payment.vietQr.quickLink }}
                    style={{ width: '100%', height: 250, backgroundColor: color.white }}
                  />
                  <Text style={s.body}>
                    {payment.vietQr.bankId} · {payment.vietQr.accountNumber}
                  </Text>
                  <Text style={s.small}>Nội dung chuyển khoản</Text>
                  <Text selectable style={s.strong}>
                    {payment.vietQr.transferContent}
                  </Text>
                  <Button
                    tone="secondary"
                    onPress={() => {
                      void Clipboard.setStringAsync(payment.vietQr!.transferContent)
                        .then(() => setNotice('Đã sao chép nội dung chuyển khoản.'))
                        .catch((cause) => setError(errorMessage(cause)));
                    }}
                  >
                    Sao chép nội dung
                  </Button>
                  <Text style={s.small}>
                    Chuyển đúng {money(payment.vietQr.amount)} với nội dung trên. Màn hình tự cập
                    nhật, không cần xác nhận đã trả.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.body}>
                    Tạo mã để thanh toán đơn. Nếu đã chuyển khoản, hãy chờ quán đối soát và bấm cập
                    nhật.
                  </Text>
                  <Button busy={busy} onPress={() => void pay('VietQR')}>
                    Lấy mã VietQR
                  </Button>
                  {initialMethod === 'COD' ? (
                    <Button busy={busy} tone="quiet" onPress={() => void pay('COD')}>
                      Thử lại yêu cầu tiền mặt
                    </Button>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
          <View style={s.card}>
            <Text style={s.heading}>Món bạn đã chọn</Text>
            {order.items.map((item, index) => (
              <View key={item.orderItemId ?? index} style={{ gap: 4 }}>
                <View style={s.between}>
                  <Text style={[s.strong, s.grow]}>
                    {item.quantity} × {item.name ?? item.menuItemName}
                  </Text>
                  <Text style={s.body}>
                    {money(item.lineTotal ?? item.unitPrice * item.quantity)}
                  </Text>
                </View>
                {item.note ? <Text style={s.small}>{item.note}</Text> : null}
              </View>
            ))}
            <View style={s.divider} />
            <View style={s.between}>
              <Text style={s.body}>Phí giao</Text>
              <Text style={s.body}>{money(order.deliveryFee)}</Text>
            </View>
            {order.discountAmount > 0 ? (
              <View style={s.between}>
                <Text style={s.body}>Giảm giá</Text>
                <Text style={s.body}>−{money(order.discountAmount)}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>
              {order.orderType === 'Delivery' ? 'Giao tận nơi' : 'Nhận tại quầy'}
            </Text>
            <Text style={s.body}>
              {order.deliveryDetails?.recipientName} · {order.deliveryDetails?.phoneNumber}
            </Text>
            {order.deliveryDetails?.address ? (
              <Text style={s.body}>{order.deliveryDetails.address}</Text>
            ) : null}
            {order.deliveryDetails?.note ? (
              <Text style={s.small}>{order.deliveryDetails.note}</Text>
            ) : null}
          </View>
          {order.events?.length ? (
            <View style={s.card}>
              <Text style={s.heading}>Hành trình đơn hàng</Text>
              {order.events.map((event, index) => (
                <View key={index} style={s.row}>
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.forest }}
                  />
                  <View style={s.grow}>
                    <Text style={s.body}>
                      {event.message ?? statusLabel(event.status ?? event.type)}
                    </Text>
                    {event.createdAt ? (
                      <Text style={s.small}>
                        {new Date(event.createdAt).toLocaleString('vi-VN')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <Button tone="quiet" busy={busy} onPress={() => void refresh()}>
        Cập nhật trạng thái
      </Button>
    </ScrollView>
  );
}

export function HistoryScreen({
  api,
  history,
  onOpen,
  onMenu,
}: {
  api: ShopApi;
  history: OrderReference[];
  onOpen: (reference: OrderReference) => void;
  onMenu: () => void;
}) {
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const results = await Promise.allSettled(
      history.map((reference) => api.order(reference.orderCode, reference.token)),
    );
    const next: Record<string, Order> = {};
    const failed: Record<string, string> = {};
    results.forEach((result, index) => {
      const ref = history[index];
      if (!ref) return;
      if (result.status === 'fulfilled') next[ref.orderCode] = result.value;
      else failed[ref.orderCode] = errorMessage(result.reason);
    });
    setOrders(next);
    setErrors(failed);
    setBusy(false);
  }, [api, history]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, [load]);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.label}>NHỮNG LẦN GHÉ MÂY</Text>
      <Text style={s.title}>Đơn của bạn.</Text>
      <Text style={s.small}>
        Các đơn đặt trên thiết bị này. Mã truy cập được lưu an toàn; không chia sẻ mã cho người
        khác.
      </Text>
      {history.length ? (
        history.map((reference) => {
          const order = orders[reference.orderCode];
          return (
            <View key={reference.orderCode} style={s.card}>
              <View style={s.between}>
                <Text style={[s.strong, s.grow]}>{reference.orderCode}</Text>
                <Text style={s.small}>
                  {new Date(reference.createdAt).toLocaleDateString('vi-VN')}
                </Text>
              </View>
              {order ? (
                <>
                  <View style={s.badge}>
                    <Text style={s.badgeText}>
                      {statusLabel(
                        order.fulfillmentStatus === 'Delivered' ? 'Delivered' : order.status,
                      )}
                    </Text>
                  </View>
                  <Text style={s.body}>
                    {order.items
                      .map((item) => `${item.quantity} ${item.name ?? item.menuItemName}`)
                      .join(', ')}
                  </Text>
                  <Text style={s.heading}>{money(order.totalAmount)}</Text>
                </>
              ) : (
                <Text style={errors[reference.orderCode] ? s.error : s.small}>
                  {errors[reference.orderCode] ?? 'Đang cập nhật…'}
                </Text>
              )}
              <Button tone="secondary" onPress={() => onOpen(reference)}>
                Xem chi tiết
              </Button>
            </View>
          );
        })
      ) : (
        <Empty
          title="Chưa có cuộc hẹn nào"
          text="Đơn đầu tiên của bạn sẽ xuất hiện ở đây. Mây đang đợi bạn chọn món."
          action="Chọn món ngay"
          onAction={onMenu}
        />
      )}
      {history.length ? (
        <Button busy={busy} tone="quiet" onPress={() => void load()}>
          Cập nhật danh sách
        </Button>
      ) : null}
    </ScrollView>
  );
}

export function openExternal(url: string, onError: (error: string) => void) {
  void Linking.openURL(url).catch((cause) => onError(errorMessage(cause)));
}
