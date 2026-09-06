import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ShopApi } from './client';
import { errorMessage, isPaid, money, statusLabel } from './logic';
import { openExternal } from './OrderScreen';
import type { Order, Session } from './types';
import { Button, Chip, Empty, Field, Message, color, s } from './ui';

export function CourierScreen({
  api,
  session,
  onAccount,
}: {
  api: ShopApi;
  session: Session;
  onAccount: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'assigned' | 'route' | 'done'>('assigned');
  const [selected, setSelected] = useState<Order | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.deliveries();
      setOrders(data.orders);
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState === null) void load();
    }, 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  const assigned = orders.filter(
    (order) =>
      !['OutForDelivery', 'Delivered', 'Failed'].includes(order.fulfillmentStatus ?? '') &&
      order.status !== 'Cancelled',
  );
  const route = orders.filter((order) => order.fulfillmentStatus === 'OutForDelivery');
  const done = orders.filter((order) =>
    ['Delivered', 'Failed'].includes(order.fulfillmentStatus ?? ''),
  );
  const visible = filter === 'assigned' ? assigned : filter === 'route' ? route : done;
  return (
    <>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.between}>
          <Text style={s.label}>MÂY / GIAO HÀNG</Text>
          <Button tone="quiet" onPress={onAccount}>
            Tài khoản
          </Button>
        </View>
        <Text style={s.title}>
          Chào {session.user.fullName.split(' ').at(-1)},{'\n'}đi một vòng nhé.
        </Text>
        <View style={[s.card, { backgroundColor: color.forest, borderWidth: 0 }]}>
          <Text style={[s.label, { color: color.pistachio }]}>CÔNG VIỆC CỦA BẠN</Text>
          <View style={s.between}>
            <View>
              <Text style={[s.title, { color: color.white }]}>{assigned.length}</Text>
              <Text style={[s.body, { color: color.pistachio }]}>Chờ lấy hàng</Text>
            </View>
            <View>
              <Text style={[s.title, { color: color.white }]}>{route.length}</Text>
              <Text style={[s.body, { color: color.pistachio }]}>Đang giao</Text>
            </View>
          </View>
          <Text style={[s.small, { color: color.pistachio }]}>
            Số liệu từ các đơn đã được quầy phân công cho bạn.
          </Text>
        </View>
        <View style={s.wrap}>
          <Chip selected={filter === 'assigned'} onPress={() => setFilter('assigned')}>
            Chờ lấy ({assigned.length})
          </Chip>
          <Chip selected={filter === 'route'} onPress={() => setFilter('route')}>
            Đang giao ({route.length})
          </Chip>
          <Chip selected={filter === 'done'} onPress={() => setFilter('done')}>
            Đã xử lý
          </Chip>
        </View>
        {error ? <Message error>{error}</Message> : null}
        {!visible.length ? (
          <Empty
            title={loading ? 'Đang cập nhật chuyến giao…' : 'Danh sách đang trống'}
            text={
              filter === 'assigned'
                ? 'Đơn được quầy phân công sẽ xuất hiện tại đây. Kéo tiếp hành trình khi quán đã chuẩn bị xong.'
                : 'Chưa có đơn ở trạng thái này.'
            }
          />
        ) : (
          visible.map((order) => (
            <View key={order.orderCode} style={s.card}>
              <View style={s.between}>
                <Text style={[s.strong, s.grow]}>{order.orderCode}</Text>
                <View style={s.badge}>
                  <Text style={s.badgeText}>{statusLabel(order.fulfillmentStatus)}</Text>
                </View>
              </View>
              <Text style={s.heading}>{order.deliveryDetails?.recipientName}</Text>
              <Text style={s.body}>{order.deliveryDetails?.address}</Text>
              <View style={s.between}>
                <Text style={s.small}>
                  {isPaid(order.paymentStatus)
                    ? 'Đã thanh toán'
                    : order.paymentMethod === 'COD'
                      ? 'Cần thu tiền mặt'
                      : 'Chờ xác nhận thanh toán'}
                </Text>
                <Text style={s.strong}>
                  {money(isPaid(order.paymentStatus) ? 0 : order.totalAmount)}
                </Text>
              </View>
              <Button tone="secondary" onPress={() => setSelected(order)}>
                Chi tiết chuyến giao
              </Button>
            </View>
          ))
        )}
        <Button tone="quiet" busy={loading} onPress={() => void load()}>
          Cập nhật công việc
        </Button>
      </ScrollView>
      {selected ? (
        <DeliveryDetail
          order={selected}
          api={api}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            setSelected(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}
function DeliveryDetail({
  order,
  api,
  onClose,
  onUpdated,
}: {
  order: Order;
  api: ShopApi;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [action, setAction] = useState<'Delivered' | 'Failed' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const codDue = order.paymentMethod === 'COD' && !isPaid(order.paymentStatus);
  const prepaid = isPaid(order.paymentStatus);
  const details = order.deliveryDetails;
  const transition = async (status: 'OutForDelivery' | 'Delivered' | 'Failed') => {
    setError('');
    if (status === 'Failed' && !note.trim()) {
      setError('Ghi rõ lý do chưa giao được để quầy hỗ trợ.');
      return;
    }
    const cash = amount.trim() ? Number(amount.replace(/[.,\s]/g, '')) : NaN;
    if (
      status === 'Delivered' &&
      codDue &&
      (!Number.isFinite(cash) || cash !== order.totalAmount)
    ) {
      setError(`Cần xác nhận đã thu đúng ${money(order.totalAmount)}. Nhập số tiền thực nhận.`);
      return;
    }
    setBusy(true);
    try {
      await api.deliveryStatus(
        order.orderCode,
        status,
        note.trim(),
        status === 'Delivered' && codDue ? cash : undefined,
      );
      onUpdated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal animationType="none" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.screen}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.between}>
            <Text style={s.label}>CHI TIẾT CHUYẾN GIAO</Text>
            <Button tone="quiet" disabled={busy} onPress={onClose}>
              Đóng
            </Button>
          </View>
          <Text style={s.title}>{order.orderCode}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{statusLabel(order.fulfillmentStatus)}</Text>
          </View>
          <View style={s.card}>
            <Text style={s.heading}>{details?.recipientName}</Text>
            <Text style={s.body}>{details?.phoneNumber}</Text>
            <Text style={s.body}>{details?.address}</Text>
            {details?.note ? <Message>{details.note}</Message> : null}
            <View style={s.wrap}>
              {details?.phoneNumber ? (
                <Button
                  tone="secondary"
                  onPress={() =>
                    openExternal(`tel:${details.phoneNumber.replace(/[^+\d]/g, '')}`, setError)
                  }
                >
                  Gọi khách
                </Button>
              ) : null}
              {details?.address ? (
                <Button
                  tone="quiet"
                  onPress={() =>
                    openExternal(
                      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(details.latitude != null && details.longitude != null ? `${details.latitude},${details.longitude}` : details.address)}`,
                      setError,
                    )
                  }
                >
                  Chỉ đường
                </Button>
              ) : null}
            </View>
          </View>
          <View style={[s.card, { backgroundColor: codDue ? color.pistachio : color.white }]}>
            <Text style={s.label}>{codDue ? 'THU TIỀN KHI GIAO' : 'THANH TOÁN'}</Text>
            <Text style={s.title}>{money(codDue ? order.totalAmount : 0)}</Text>
            <Text style={s.body}>
              {codDue
                ? 'Kiểm tra tiền nhận đủ trước khi xác nhận đã giao.'
                : prepaid
                  ? 'Đơn đã thanh toán. Không thu thêm từ khách.'
                  : 'Chưa xác nhận thanh toán. Liên hệ quầy trước khi giao.'}
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.heading}>Kiểm tra túi hàng</Text>
            {order.items.map((item, index) => (
              <View key={item.orderItemId ?? index}>
                <Text style={s.strong}>
                  {item.quantity} × {item.name ?? item.menuItemName}
                </Text>
                {item.note ? <Text style={s.small}>{item.note}</Text> : null}
              </View>
            ))}
          </View>
          {error ? <Message error>{error}</Message> : null}
          {order.fulfillmentStatus === 'OutForDelivery' ? (
            action ? (
              <View style={s.card}>
                <Text style={s.heading}>
                  {action === 'Delivered'
                    ? 'Xác nhận đã giao đủ món'
                    : 'Ghi nhận giao chưa thành công'}
                </Text>
                {action === 'Delivered' && codDue ? (
                  <Field
                    label="Số tiền mặt đã thu (đ) *"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    placeholder="Nhập số tiền thực nhận"
                  />
                ) : null}
                {action === 'Failed' ? (
                  <Field
                    label="Lý do chưa giao được *"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={500}
                    placeholder="Ví dụ: đã gọi 3 lần, khách không nghe máy"
                  />
                ) : (
                  <Text style={s.body}>
                    Chỉ xác nhận sau khi khách đã nhận đầy đủ. Thao tác cập nhật trạng thái đơn cho
                    quầy và khách.
                  </Text>
                )}
                <Button
                  busy={busy}
                  tone={action === 'Failed' ? 'danger' : 'primary'}
                  onPress={() => void transition(action)}
                >
                  {action === 'Delivered' ? 'Xác nhận hoàn tất giao hàng' : 'Gửi về quầy hỗ trợ'}
                </Button>
                <Button tone="quiet" disabled={busy} onPress={() => setAction(null)}>
                  Quay lại
                </Button>
              </View>
            ) : (
              <>
                <Button onPress={() => setAction('Delivered')}>Đã giao đủ món</Button>
                <Button tone="quiet" onPress={() => setAction('Failed')}>
                  Không giao được · Báo quầy
                </Button>
              </>
            )
          ) : !['Delivered', 'Failed'].includes(order.fulfillmentStatus ?? '') &&
            order.status !== 'Cancelled' ? (
            <>
              <Message>
                {order.status === 'Ready'
                  ? 'Kiểm đủ món, nhận túi từ quầy rồi bắt đầu giao.'
                  : 'Quán đang chuẩn bị. Chỉ lấy hàng khi đơn sẵn sàng.'}
              </Message>
              <Button
                busy={busy}
                disabled={order.status !== 'Ready'}
                onPress={() => void transition('OutForDelivery')}
              >
                Đã lấy hàng · Bắt đầu giao
              </Button>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
