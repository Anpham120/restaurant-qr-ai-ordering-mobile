import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import {
  type CustomerOrder,
  type OrderItem,
  chophepHuyMon,
  moTaBepDong,
  moTaUocLuong,
  nhanTrangThaiDon,
  nhanTrangThaiMon,
} from '../core/orders/order';
import { type OrderApi } from '../core/orders/orderApi';
import { type OrderTokenStore } from '../core/orders/orderTokenStore';
import { type TableSession } from '../core/tables/tableSession';
import { tienVnd } from '../core/tien';
import { MauQuan, kieuChung } from './theme';

export interface OrdersScreenProps {
  api: OrderApi;
  phienBan: TableSession;
  tokenStore: OrderTokenStore;
  /**
   * Hỏi xác nhận trước khi huỷ. Tiêm được để test không phải giả lập `Alert` của nền tảng.
   *
   * Bản Flutter dùng `showDialog` trả `Future<bool?>`. `Alert.alert` của React Native chỉ nhận
   * callback, nên phải bọc lại thành Promise — và bọc ở đây, không bọc trong màn hình, để test
   * đọc được cả nhánh đồng ý lẫn nhánh từ chối.
   */
  hoiXacNhan?: (tieuDe: string, noiDung: string) => Promise<boolean>;
}

function hoiBangAlert(tieuDe: string, noiDung: string): Promise<boolean> {
  return new Promise((tra) => {
    Alert.alert(tieuDe, noiDung, [
      { text: 'Không', style: 'cancel', onPress: () => tra(false) },
      { text: 'Huỷ món', style: 'destructive', onPress: () => tra(true) },
    ]);
  });
}

interface DuLieu {
  readonly don: readonly CustomerOrder[];
  readonly tokenDon: Record<string, string>;
}

/** Đơn của bàn, kèm huỷ món của chính máy này (hạn chế #11). */
export function OrdersScreen({
  api,
  phienBan,
  tokenStore,
  hoiXacNhan = hoiBangAlert,
}: OrdersScreenProps) {
  const [duLieu, setDuLieu] = useState<DuLieu | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangHuy, setDangHuy] = useState<string | null>(null);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  const nap = useCallback(async () => {
    try {
      const don = await api.donCuaPhien(phienBan.sessionId, phienBan.tableSessionToken);
      // Đọc token cùng lúc với đơn: nút huỷ chỉ hiện khi máy này có token của đúng đơn đó, nên
      // hai thứ phải luôn khớp nhau trong một lần vẽ.
      const tokenDon = await tokenStore.tatCa();
      return { ok: true as const, duLieu: { don, tokenDon } };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [api, phienBan, tokenStore]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof nap>>) => {
    if (kq.ok) {
      setDuLieu(kq.duLieu);
      setLoi(null);
    } else if ('loiNang' in kq) {
      setLoiNang(kq.loiNang);
    } else {
      setLoi(kq.loi);
    }
  }, []);

  const tai = useCallback(async () => {
    apDung(await nap());
  }, [apDung, nap]);

  /** Đọc lại nhưng GIỮ câu báo lỗi — cùng lý do đã ghi ở CartScreen. */
  const taiGiuLoi = useCallback(async () => {
    const kq = await nap();
    if (kq.ok) setDuLieu(kq.duLieu);
    else if ('loiNang' in kq) setLoiNang(kq.loiNang);
  }, [nap]);

  useEffect(() => {
    let huy = false;
    void nap().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, nap]);

  const huy = useCallback(
    async (don: CustomerOrder, mon: OrderItem) => {
      if (dangHuy !== null) return;
      const token = duLieu?.tokenDon[don.orderCode];
      if (token === undefined) return;

      // Nói RÕ món nào và bao nhiêu phần. Ở màn hình có nhiều dòng giống nhau, một hộp thoại chỉ
      // hỏi "bạn có chắc không" là chỗ dễ bấm nhầm nhất.
      const dongY = await hoiXacNhan(
        'Huỷ món này?',
        `${mon.quantity} x ${mon.name} sẽ bị bỏ khỏi đơn ${don.orderCode}.`,
      );
      if (!dongY) return;

      setDangHuy(mon.orderItemId);
      setLoi(null);
      try {
        await api.huyMon(don.orderCode, mon.orderItemId, token);
        // Đọc lại thay vì tự xoá dòng: bếp có thể vừa đổi trạng thái món khác, và danh sách đọc
        // lại là sự thật duy nhất.
        await tai();
      } catch (e) {
        if (!(e instanceof AuthException)) {
          setLoiNang(e);
          return;
        }
        setLoi(e.message);
        // Bếp đã nấu mất rồi: đọc lại để trạng thái trên màn hình khớp với thực tế.
        if (e.code === 'ORDER_ITEM_CANCEL_NOT_ALLOWED') await taiGiuLoi();
      } finally {
        setDangHuy(null);
      }
    },
    [api, dangHuy, duLieu, hoiXacNhan, tai, taiGiuLoi],
  );

  if (loiNang !== null) throw loiNang;

  if (loi !== null) {
    return (
      <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
        <Text style={{ color: MauQuan.danger }}>{loi}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void tai()}
          style={kieuChung.nutVien}
        >
          <Text style={kieuChung.chuNutVien}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (duLieu === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={kieuChung.tieuDe}>Đơn bàn {phienBan.tableCode}</Text>
      {duLieu.don.length === 0 ? (
        <Text style={[kieuChung.chuPhu, { padding: 32, textAlign: 'center' }]}>
          Bàn chưa có đơn nào.
        </Text>
      ) : (
        duLieu.don.map((d) => (
          <View key={d.orderId} style={[kieuChung.the, { gap: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: MauQuan.ink }}>
                {d.orderCode}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={kieuChung.chuPhu}>{nhanTrangThaiDon(d.status)}</Text>
            </View>
            {d.items.map((m) => (
              <DongMon
                coToken={Object.prototype.hasOwnProperty.call(duLieu.tokenDon, d.orderCode)}
                dangHuy={dangHuy}
                key={m.orderItemId}
                mon={m}
                onHuy={() => void huy(d, m)}
              />
            ))}
            <Text style={{ textAlign: 'right', fontWeight: '700', color: MauQuan.ink }}>
              Tổng {tienVnd(d.totalAmount)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

interface DongMonProps {
  mon: OrderItem;
  coToken: boolean;
  dangHuy: string | null;
  onHuy: () => void;
}

function DongMon({ mon: m, coToken, dangHuy, onHuy }: DongMonProps) {
  const uocLuong = moTaUocLuong(m.estimatedReadyMinutesLow, m.estimatedReadyMinutesHigh);
  const lyDoLau = moTaBepDong(m.kitchenBusy, uocLuong);
  const huyDuoc = chophepHuyMon(m.status, coToken);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={kieuChung.chu}>
          {m.quantity} x {m.name}
        </Text>
        {/*
          KHÔNG hiện gì khi chưa có ước lượng. Một câu thay thế kiểu "đang tính" hay "khoảng 15
          phút" phá đúng cơ chế mà hạn chế #10 dựng lên.
        */}
        {uocLuong !== null ? <Text style={kieuChung.chuPhu}>Dự kiến {uocLuong}</Text> : null}
        {/*
          Nói VÌ SAO lâu, ngay dưới con số. Đo thật ở #143: bếp rảnh 15–25 phút, bếp khai trễ
          +20 thì 42–57 phút. Con số nhảy gấp đôi mà không giải thích trông như app tính sai.
        */}
        {lyDoLau !== null ? (
          <Text style={{ color: MauQuan.danger, fontSize: 13 }}>{lyDoLau}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={kieuChung.chuPhu}>{nhanTrangThaiMon(m.status)}</Text>
        <Text style={kieuChung.chu}>{tienVnd(m.lineTotal)}</Text>
      </View>
      {huyDuoc ? (
        <TouchableOpacity
          accessibilityLabel={`Huỷ ${m.name}`}
          accessibilityRole="button"
          disabled={dangHuy !== null}
          onPress={onHuy}
          style={[
            kieuChung.nutVien,
            { paddingHorizontal: 12, paddingVertical: 6 },
            dangHuy !== null ? kieuChung.nutTat : null,
          ]}
        >
          <Text style={kieuChung.chuNutVien}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
