import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { ShopApiError, type ShopApi } from './client';
import {
  cartTotal,
  contactErrors,
  errorMessage,
  money,
  selectedOptions,
  selectionError,
  unitPrice,
} from './logic';
import type { CartLine, Contact, CreateOrder, Menu, Order, Quote, ShopConfig } from './types';
import { Button, Chip, Empty, Field, Message, Quantity, s } from './ui';
import { shopStorage } from './storage';

export function CartScreen({
  cart,
  onChange,
  onMenu,
  api,
  config,
  menu,
  onCreated,
  onSubmitting,
  onCatalog,
}: {
  cart: CartLine[];
  onChange: (lines: CartLine[]) => void;
  onMenu: () => void;
  api: ShopApi;
  config: ShopConfig | null;
  menu: Menu | null;
  onCreated: (order: Order, method: 'VietQR' | 'COD') => Promise<void>;
  onSubmitting?: (busy: boolean) => void;
  onCatalog?: (menu: Menu, config: ShopConfig) => void;
}) {
  const [checkout, setCheckout] = useState(false);
  const [type, setType] = useState<'Delivery' | 'Pickup'>('Delivery');
  const [method, setMethod] = useState<'VietQR' | 'COD'>('VietQR');
  const [contact, setContact] = useState<Contact>({
    recipientName: '',
    phoneNumber: '',
    address: '',
    note: '',
  });
  const [coordinates, setCoordinates] = useState({ latitude: '', longitude: '' });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Contact, string>>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [priceChanged, setPriceChanged] = useState(false);
  const submitting = useRef(false);
  const quoteVersion = useRef(0);
  const subtotal = cartTotal(cart);
  const fee = type === 'Pickup' ? 0 : quote?.deliveryFee;
  const changePoint = (point: { latitude: string; longitude: string }) => {
    quoteVersion.current += 1;
    setCoordinates(point);
    setQuote(null);
  };
  const loadQuote = async (point = coordinates) => {
    setQuoteBusy(true);
    setError('');
    setQuote(null);
    const version = ++quoteVersion.current;
    try {
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);
      if (
        !point.latitude.trim() ||
        !point.longitude.trim() ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        throw new Error(
          'Nhập vĩ độ từ -90 đến 90 và kinh độ từ -180 đến 180, hoặc dùng vị trí hiện tại.',
        );
      const result = await api.quote(latitude, longitude);
      if (version === quoteVersion.current) setQuote(result);
    } catch (cause) {
      if (version === quoteVersion.current) setError(errorMessage(cause));
    } finally {
      setQuoteBusy(false);
    }
  };
  const locate = async () => {
    setQuoteBusy(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted')
        throw new Error('Bạn chưa cho phép vị trí. Có thể nhập toạ độ điểm nhận hàng bên dưới.');
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = {
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      };
      changePoint(point);
      await loadQuote(point);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setQuoteBusy(false);
    }
  };
  const submit = async () => {
    if (submitting.current) return;
    setError('');
    const validation = contactErrors(contact, type);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    if (!config || !menu) {
      setError('Chưa tải được cấu hình quán. Quay lại thực đơn và thử tải lại.');
      return;
    }
    if (subtotal < config.minimumOrder) {
      setError(`Đơn tối thiểu ${money(config.minimumOrder)}. Thêm món để tiếp tục.`);
      return;
    }
    if (type === 'Delivery' && !quote) {
      setError('Xác nhận điểm giao để quán tính phí trước khi đặt.');
      return;
    }
    if (method === 'COD' && !config.allowCod) {
      setError('Quán hiện chỉ nhận chuyển khoản. Vui lòng chọn VietQR.');
      return;
    }
    for (const line of cart) {
      const product = menu.items.find((item) => item.id === line.product.id);
      const problem = product
        ? selectionError(product, line.optionIds)
        : 'Món không còn trong thực đơn.';
      if (problem) {
        setError(`${line.product.name}: ${problem} Xoá món và chọn lại từ thực đơn.`);
        return;
      }
    }
    const body: CreateOrder = {
      orderType: type,
      expectedTotalAmount: subtotal + (fee ?? 0),
      deliveryDetails: {
        ...contact,
        recipientName: contact.recipientName.trim(),
        phoneNumber: contact.phoneNumber.replace(/[\s.-]/g, ''),
        address: type === 'Delivery' ? contact.address.trim() : '',
        ...(type === 'Delivery'
          ? { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) }
          : {}),
      },
      items: cart.map((line) => ({
        menuItemId: line.product.id,
        optionIds: line.optionIds,
        quantity: line.quantity,
        note: line.note,
      })),
    };
    const fingerprint = JSON.stringify(body);
    submitting.current = true;
    setBusy(true);
    onSubmitting?.(true);
    try {
      const key = await shopStorage.orderAttempt(api.origin, fingerprint);
      const order = await api.createOrder(body, key);
      await onCreated(order, method);
      await shopStorage.clearAttempt(api.origin);
    } catch (cause) {
      if (cause instanceof ShopApiError && cause.code === 'ORDER_TOTAL_CHANGED')
        setPriceChanged(true);
      setError(errorMessage(cause));
    } finally {
      submitting.current = false;
      onSubmitting?.(false);
      setBusy(false);
    }
  };
  const refreshPrices = async () => {
    setBusy(true);
    try {
      const [freshMenu, freshConfig] = await Promise.all([api.menu(), api.config()]);
      const lines = cart.map((line) => ({
        ...line,
        product: freshMenu.items.find((product) => product.id === line.product.id) ?? {
          ...line.product,
          isAvailable: false,
        },
      }));
      onCatalog?.(freshMenu, freshConfig);
      onChange(lines);
      setQuote(null);
      quoteVersion.current += 1;
      setPriceChanged(false);
      setError(
        type === 'Delivery'
          ? 'Giá món đã cập nhật. Xác nhận lại điểm giao và kiểm tra tổng mới trước khi đặt.'
          : 'Giá món đã cập nhật. Kiểm tra tổng mới trước khi đặt.',
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  if (!cart.length)
    return (
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.label}>GIỎ CỦA BẠN</Text>
        <Text style={s.title}>Một chút ngọt{'\n'}đang chờ.</Text>
        <Empty
          title="Giỏ hàng còn trống"
          text="Chọn một ly nước mát, phần kem hoặc chè. Mây sẽ chuẩn bị theo đúng sở thích của bạn."
          action="Khám phá thực đơn"
          onAction={onMenu}
        />
      </ScrollView>
    );
  return (
    <KeyboardAvoidingView style={s.grow} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.between}>
          <View style={s.grow}>
            <Text style={s.label}>
              {checkout ? '02 / THÔNG TIN NHẬN HÀNG' : '01 / GIỎ CỦA BẠN'}
            </Text>
            <Text style={s.title}>{checkout ? 'Hẹn bạn ở đâu?' : 'Vừa ý bạn.'}</Text>
          </View>
          {checkout ? (
            <Button tone="quiet" onPress={() => setCheckout(false)}>
              Trở lại
            </Button>
          ) : null}
        </View>
        {!checkout ? (
          cart.map((line) => (
            <View key={line.key} style={s.card}>
              <View style={s.between}>
                <Text style={[s.heading, s.grow]}>{line.product.name}</Text>
                <Text style={s.strong}>{money(unitPrice(line) * line.quantity)}</Text>
              </View>
              <Text style={s.small}>
                {selectedOptions(line.product, line.optionIds)
                  .map((option) => option.name)
                  .join(' · ') || 'Nguyên bản'}
                {line.note ? `\n${line.note}` : ''}
              </Text>
              <View style={s.wrap}>
                <Quantity
                  label={line.product.name}
                  quantity={line.quantity}
                  onChange={(quantity) =>
                    onChange(
                      quantity > 0
                        ? cart.map((item) => (item.key === line.key ? { ...item, quantity } : item))
                        : cart.filter((item) => item.key !== line.key),
                    )
                  }
                />
                <Button
                  tone="quiet"
                  onPress={() => onChange(cart.filter((item) => item.key !== line.key))}
                >
                  Xoá món
                </Button>
              </View>
            </View>
          ))
        ) : (
          <>
            <View style={s.wrap}>
              <Chip selected={type === 'Delivery'} onPress={() => setType('Delivery')}>
                Giao tận nơi
              </Chip>
              <Chip selected={type === 'Pickup'} onPress={() => setType('Pickup')}>
                Nhận tại quầy
              </Chip>
            </View>
            {type === 'Pickup' && config ? (
              <Message>
                Nhận tại {config.name}: {config.address || 'Liên hệ quán để xác nhận địa chỉ.'}
              </Message>
            ) : null}
            <Field
              label="Tên người nhận *"
              value={contact.recipientName}
              onChangeText={(recipientName) =>
                setContact((current) => ({ ...current, recipientName }))
              }
              error={errors.recipientName}
              textContentType="name"
              autoComplete="name"
              maxLength={100}
            />
            <Field
              label="Số điện thoại *"
              value={contact.phoneNumber}
              onChangeText={(phoneNumber) => setContact((current) => ({ ...current, phoneNumber }))}
              error={errors.phoneNumber}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={20}
            />
            {type === 'Delivery' ? (
              <>
                <Field
                  label="Địa chỉ nhận hàng *"
                  value={contact.address}
                  onChangeText={(address) => {
                    setContact((current) => ({ ...current, address }));
                    setQuote(null);
                    quoteVersion.current += 1;
                  }}
                  error={errors.address}
                  placeholder="Số nhà, đường, phường/xã, tỉnh/thành"
                  autoComplete="street-address"
                  multiline
                  maxLength={500}
                />
                <View style={s.card}>
                  <Text style={s.heading}>Điểm giao trên bản đồ</Text>
                  <Text style={s.small}>
                    Địa chỉ và điểm giao cần cùng một nơi. Phí giao được quán tính theo khoảng cách
                    từ quán đến điểm này.
                  </Text>
                  <Button tone="secondary" busy={quoteBusy} onPress={() => void locate()}>
                    Dùng vị trí hiện tại
                  </Button>
                  <Field
                    label="Vĩ độ *"
                    value={coordinates.latitude}
                    onChangeText={(latitude) => changePoint({ ...coordinates, latitude })}
                    placeholder="Ví dụ 10.7769"
                    keyboardType="numbers-and-punctuation"
                  />
                  <Field
                    label="Kinh độ *"
                    value={coordinates.longitude}
                    onChangeText={(longitude) => changePoint({ ...coordinates, longitude })}
                    placeholder="Ví dụ 106.7009"
                    keyboardType="numbers-and-punctuation"
                  />
                  <Button tone="quiet" busy={quoteBusy} onPress={() => void loadQuote()}>
                    Xác nhận điểm & tính phí
                  </Button>
                  {quote ? (
                    <Message>
                      {quote.distanceKm.toFixed(1)} km · Phí giao {money(quote.deliveryFee)}
                    </Message>
                  ) : null}
                  {config ? (
                    <Text style={s.small}>
                      Miễn phí {config.shippingFreeRadiusKm} km đầu. Sau đó{' '}
                      {money(config.shippingPerKm)} mỗi km phát sinh, làm tròn lên.
                    </Text>
                  ) : null}
                  <Button
                    tone="quiet"
                    onPress={() => {
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address || `${coordinates.latitude},${coordinates.longitude}`)}`,
                      ).catch((cause) => setError(errorMessage(cause)));
                    }}
                  >
                    Kiểm tra địa chỉ trên bản đồ
                  </Button>
                </View>
              </>
            ) : null}
            <Field
              label="Ghi chú giao nhận"
              value={contact.note}
              onChangeText={(note) => setContact((current) => ({ ...current, note }))}
              placeholder="Ví dụ: gọi khi đến cổng"
              multiline
              maxLength={300}
            />
            <View style={{ gap: 12 }}>
              <Text style={s.heading}>Thanh toán</Text>
              <Chip selected={method === 'VietQR'} onPress={() => setMethod('VietQR')}>
                Chuyển khoản VietQR
              </Chip>
              {config?.allowCod ? (
                <Chip selected={method === 'COD'} onPress={() => setMethod('COD')}>
                  {type === 'Delivery' ? 'Tiền mặt khi nhận hàng' : 'Tiền mặt tại quầy'}
                </Chip>
              ) : null}
              <Text style={s.small}>
                {method === 'COD'
                  ? 'Quán sẽ xác nhận đơn tiền mặt trước khi chuẩn bị.'
                  : 'Sau khi đặt, mã chuyển khoản sẽ hiện ở màn theo dõi đơn. Trạng thái cập nhật khi quán nhận được tiền.'}
              </Text>
            </View>
          </>
        )}
        <View style={s.card}>
          <View style={s.between}>
            <Text style={s.body}>Tạm tính</Text>
            <Text style={s.strong}>{money(subtotal)}</Text>
          </View>
          {checkout ? (
            <View style={s.between}>
              <Text style={s.body}>Phí giao</Text>
              <Text style={s.strong}>{fee === undefined ? 'Chờ điểm giao' : money(fee)}</Text>
            </View>
          ) : null}
          <View style={s.divider} />
          <View style={s.between}>
            <Text style={s.heading}>{checkout ? 'Tổng dự kiến' : 'Tạm tính'}</Text>
            <Text style={s.heading}>{money(subtotal + (checkout ? (fee ?? 0) : 0))}</Text>
          </View>
          <Text style={s.small}>Giá cuối cùng được quán xác nhận khi tạo đơn.</Text>
        </View>
        {error ? <Message error>{error}</Message> : null}
        {priceChanged ? (
          <Button busy={busy} tone="secondary" onPress={() => void refreshPrices()}>
            Cập nhật giá & phí giao
          </Button>
        ) : null}
        <Button busy={busy} onPress={checkout ? () => void submit() : () => setCheckout(true)}>
          {checkout ? 'Đặt đơn tại Mây' : 'Tiếp tục · Thông tin nhận hàng'}
        </Button>
        {!checkout ? (
          <Button tone="quiet" onPress={onMenu}>
            Thêm món khác
          </Button>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
