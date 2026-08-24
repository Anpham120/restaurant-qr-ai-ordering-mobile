import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import {
  type FavouriteApi,
  type MonHayGoi,
  locThoiQuen,
  moTaThoiQuen,
} from '../core/orders/favouriteApi';
import { type CustomerOrder, nhanTrangThaiDon } from '../core/orders/order';
import {
  type KetQuaDatLai,
  type OrderHistoryApi,
  datLaiDon,
  thatBaiHoanToan,
  tronVen,
} from '../core/orders/orderHistoryApi';
import { tienVnd } from '../core/tien';
import { MauQuan, kieuChung } from './theme';

export interface HistoryScreenProps {
  historyApi: OrderHistoryApi;
  favouriteApi: FavouriteApi;
  accessToken: string;
  /** Thêm món vào giỏ. Bỏ trống khi chưa vào bàn — lúc đó không có nút đặt lại. */
  themVaoGio?: ((menuItemId: string, quantity: number) => Promise<void>) | undefined;
  onBaoTin?: ((tin: string) => void) | undefined;
}

/**
 * Câu báo sau khi đặt lại đơn cũ.
 *
 * Tách thành hàm thuần vì đây là chỗ dễ nói dối với khách nhất: ba nhánh, và nhánh giữa — thêm
 * được một phần — là nhánh hay bị gộp vào "đã thêm vào giỏ". Khách chỉ phát hiện lúc nhìn hoá đơn.
 */
export function moTaKetQuaDatLai(kq: KetQuaDatLai): string {
  const thieu = Object.keys(kq.khongThem).join(', ');
  if (tronVen(kq)) return `Đã thêm ${kq.daThem.length} món vào giỏ`;
  if (thatBaiHoanToan(kq)) return `Không thêm được món nào: ${thieu}`;
  return `Đã thêm ${kq.daThem.length} món. Không còn: ${thieu}`;
}

function ngayGon(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hai = (n: number) => String(n).padStart(2, '0');
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Lịch sử đơn qua nhiều lần ghé và món hay gọi (#33, #35). */
export function HistoryScreen({
  historyApi,
  favouriteApi,
  accessToken,
  themVaoGio,
  onBaoTin,
}: HistoryScreenProps) {
  const [don, setDon] = useState<readonly CustomerOrder[] | null>(null);
  const [hayGoi, setHayGoi] = useState<readonly MonHayGoi[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangDatLai, setDangDatLai] = useState<string | null>(null);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  const nap = useCallback(async () => {
    try {
      const ds = await historyApi.lichSuCuaToi(accessToken);
      // Món hay gọi là phần PHỤ: hỏng nó không được làm mất lịch sử đơn, thứ khách vào đây để xem.
      let mon: readonly MonHayGoi[] = [];
      try {
        mon = locThoiQuen(await favouriteApi.monHayGoi(accessToken));
      } catch {
        mon = [];
      }
      return { ok: true as const, don: ds, hayGoi: mon };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [accessToken, favouriteApi, historyApi]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof nap>>) => {
    if (kq.ok) {
      setDon(kq.don);
      setHayGoi(kq.hayGoi);
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

  useEffect(() => {
    let huy = false;
    void nap().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, nap]);

  const datLai = useCallback(
    async (d: CustomerOrder) => {
      if (dangDatLai !== null || themVaoGio === undefined) return;
      setDangDatLai(d.orderCode);
      try {
        const kq = await datLaiDon(d.items, themVaoGio, (e) =>
          e instanceof AuthException ? e.message : 'Không thêm được',
        );
        // Báo CẢ HAI danh sách. "Đã thêm vào giỏ" rồi im lặng bỏ ba món là nói dối với khách; họ
        // chỉ phát hiện lúc nhìn hoá đơn.
        onBaoTin?.(moTaKetQuaDatLai(kq));
      } finally {
        setDangDatLai(null);
      }
    },
    [dangDatLai, onBaoTin, themVaoGio],
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

  if (don === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={kieuChung.tieuDe}>Lịch sử đơn</Text>

      {hayGoi.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: MauQuan.ink }}>
            Món bạn hay gọi
          </Text>
          {hayGoi.map((m) => (
            <View
              key={m.menuItemId}
              style={[kieuChung.the, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
                  {m.name}
                </Text>
                <Text style={kieuChung.chuPhu}>{moTaThoiQuen(m) ?? ''}</Text>
              </View>
              {themVaoGio !== undefined ? (
                <TouchableOpacity
                  accessibilityLabel={`Thêm ${m.name}`}
                  accessibilityRole="button"
                  onPress={() => {
                    void themVaoGio(m.menuItemId, 1).then(
                      () => onBaoTin?.(`Đã thêm ${m.name} vào giỏ`),
                      (e: unknown) =>
                        onBaoTin?.(e instanceof AuthException ? e.message : 'Không thêm được'),
                    );
                  }}
                  style={[kieuChung.nutVien, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={kieuChung.chuNutVien}>Thêm</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {don.length === 0 ? (
        <Text style={[kieuChung.chuPhu, { padding: 32, textAlign: 'center' }]}>
          Chưa có đơn nào.{'\n'}Đơn đặt khi đã đăng nhập sẽ hiện ở đây.
        </Text>
      ) : (
        don.map((d) => (
          <View key={d.orderId} style={[kieuChung.the, { gap: 6 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: MauQuan.ink }}>
                {d.orderCode}
              </Text>
              <Text style={kieuChung.chuPhu}>{ngayGon(d.createdAt)}</Text>
            </View>
            <Text style={kieuChung.chuPhu}>{nhanTrangThaiDon(d.status)}</Text>
            {d.items.map((m) => (
              <Text key={m.orderItemId} style={kieuChung.chu}>
                {m.quantity} x {m.name}
              </Text>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ flex: 1, fontWeight: '700', color: MauQuan.ink }}>
                {tienVnd(d.totalAmount)}
              </Text>
              {themVaoGio !== undefined ? (
                <TouchableOpacity
                  accessibilityLabel={`Đặt lại ${d.orderCode}`}
                  accessibilityRole="button"
                  disabled={dangDatLai !== null}
                  onPress={() => void datLai(d)}
                  style={[
                    kieuChung.nutVien,
                    { paddingHorizontal: 16, paddingVertical: 8 },
                    dangDatLai !== null ? kieuChung.nutTat : null,
                  ]}
                >
                  <Text style={kieuChung.chuNutVien}>
                    {dangDatLai === d.orderCode ? 'Đang thêm…' : 'Đặt lại'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}
