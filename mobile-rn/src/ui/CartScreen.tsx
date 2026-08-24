import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type Cart, type CartItem, coMonHetHang, dauVetGio, gioRong } from '../core/cart/cart';
import { type CartApi } from '../core/cart/cartApi';
import { type CreateOrderApi, type CreatedOrder } from '../core/orders/createOrderApi';
import { KhoaDatDon } from '../core/orders/khoaDatDon';
import { type TableSession } from '../core/tables/tableSession';
import { tienVnd } from '../core/tien';
import { MauQuan, kieuChung } from './theme';

export interface CartScreenProps {
  cartApi: CartApi;
  createOrderApi: CreateOrderApi;
  phienBan: TableSession;
  /** Số đã liên kết với tài khoản — tự điền lúc đặt, §9.7 gọi đây là tính năng lõi. */
  soDienThoai?: string | null | undefined;
  onDatXong: (don: CreatedOrder) => void;
}

/** Mã lỗi mà sau đó phải ĐỌC LẠI giỏ, vì thứ khách đang nhìn không còn đúng. */
const PHAI_TAI_LAI = new Set([
  'IDEMPOTENCY_KEY_REUSED',
  'MENU_ITEM_UNAVAILABLE',
  'TABLE_SESSION_CONFLICT',
]);

/** Giỏ hàng và đặt món (§9.10 M2 mục 5). */
export function CartScreen({
  cartApi,
  createOrderApi,
  phienBan,
  soDienThoai = null,
  onDatXong,
}: CartScreenProps) {
  const [gio, setGio] = useState<Cart | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  // Một khoá cho suốt vòng đời màn hình. `useMemo` chứ không tạo mới mỗi lượt dựng: tạo mới nghĩa
  // là mỗi lần React vẽ lại thì khoá đổi, tức mất hẳn tác dụng của Idempotency-Key.
  const khoa = useMemo(() => new KhoaDatDon(), []);

  const napGio = useCallback(async () => {
    try {
      return {
        ok: true as const,
        gio: await cartApi.gio(phienBan.sessionId, phienBan.tableSessionToken),
      };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [cartApi, phienBan]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof napGio>>) => {
    if (kq.ok) {
      setGio(kq.gio);
      setLoi(null);
    } else if ('loiNang' in kq) {
      setLoiNang(kq.loiNang);
    } else {
      setLoi(kq.loi);
    }
  }, []);

  const tai = useCallback(async () => {
    apDung(await napGio());
  }, [apDung, napGio]);

  /**
   * Đọc lại giỏ nhưng GIỮ NGUYÊN câu báo lỗi đang hiện.
   *
   * Dùng sau khi một thao tác hỏng. Bản Flutter xoá lỗi ở đầu mỗi lần đọc lại, nên câu báo loé
   * lên rồi biến mất — và khách chỉ còn thấy số lượng không đổi mà không biết vì sao. Chính cái
   * họ vừa bấm mới là thứ cần giải thích, không phải cái giỏ.
   */
  const taiGiuLoi = useCallback(async () => {
    const kq = await napGio();
    if (kq.ok) setGio(kq.gio);
    else if ('loiNang' in kq) setLoiNang(kq.loiNang);
  }, [napGio]);

  useEffect(() => {
    let huy = false;
    void napGio().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, napGio]);

  /**
   * Cộng/trừ một món.
   *
   * KHÔNG cập nhật lạc quan ở đây. Giỏ hàng nhận DELTA, nên nếu đoán sai thì con số trên màn hình
   * lệch hẳn với máy chủ, và khách sẽ bấm thêm để "sửa" — làm lệch thêm. Phản hồi luôn trả về cả
   * giỏ, nên chờ nó rồi vẽ lại là vừa đúng vừa đơn giản.
   */
  const doi = useCallback(
    async (menuItemId: string, delta: number) => {
      if (dangGui) return;
      setDangGui(true);
      setLoi(null);
      try {
        setGio(
          await cartApi.doiSoLuong(
            phienBan.sessionId,
            phienBan.tableSessionToken,
            menuItemId,
            delta,
          ),
        );
      } catch (e) {
        if (!(e instanceof AuthException)) {
          setLoiNang(e);
          return;
        }
        setLoi(e.message);
        // Lỗi mạng: KHÔNG gửi lại delta. Đọc lại giỏ để hiện sự thật thay vì đoán.
        if (e.code === 'NETWORK_ERROR') await taiGiuLoi();
      } finally {
        setDangGui(false);
      }
    },
    [cartApi, dangGui, phienBan, taiGiuLoi],
  );

  const dat = useCallback(async () => {
    if (gio === null || gioRong(gio) || dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      const don = await createOrderApi.taoDon({
        phienBan,
        gio,
        // Cùng giỏ thì cùng khoá — gửi lại sau lỗi mạng không tạo đơn thứ hai.
        khoaIdempotency: khoa.khoaCho(dauVetGio(gio)),
        soDienThoai,
      });
      // Quên khoá SAU KHI thành công: lần đặt sau với giỏ trùng nội dung phải là đơn mới.
      khoa.quen();
      await tai();
      onDatXong(don);
    } catch (e) {
      if (!(e instanceof AuthException)) {
        setLoiNang(e);
        return;
      }
      setLoi(e.message);
      // Giỏ lệch hoặc món vừa hết: đọc lại để khách thấy đúng thứ mình đang có.
      if (PHAI_TAI_LAI.has(e.code)) await taiGiuLoi();
    } finally {
      setDangGui(false);
    }
  }, [createOrderApi, dangGui, gio, khoa, onDatXong, phienBan, soDienThoai, tai, taiGiuLoi]);

  // Ném lúc dựng giao diện để error boundary bắt được — ném trong callback bất đồng bộ chỉ tạo
  // ra một unhandled rejection mà không ai nhìn thấy.
  if (loiNang !== null) throw loiNang;

  const conMonHet = gio !== null && coMonHetHang(gio);

  if (gio === null && loi === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <View style={kieuChung.man}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={kieuChung.tieuDe}>Giỏ hàng</Text>
        {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}
        {gio !== null && gioRong(gio) ? (
          <Text style={[kieuChung.chuPhu, { padding: 32, textAlign: 'center' }]}>
            Giỏ đang trống. Chọn món ở tab Thực đơn.
          </Text>
        ) : null}
        {gio?.items.map((i) => (
          <DongMon dangGui={dangGui} key={i.menuItemId} mon={i} onDoi={doi} />
        ))}
      </ScrollView>

      {gio !== null && !gioRong(gio) ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: MauQuan.clayLine,
            backgroundColor: MauQuan.trang,
            padding: 16,
            gap: 8,
          }}
        >
          {conMonHet ? (
            // Chặn ở đây thay vì để backend từ chối cả đơn: một lời từ chối sau khi khách đã bấm
            // "Đặt món" tệ hơn nhiều so với chỉ ra ngay trong giỏ.
            <Text style={{ color: MauQuan.danger }}>Có món vừa hết. Bỏ món đó ra rồi đặt lại.</Text>
          ) : null}
          {soDienThoai !== null ? (
            <Text style={kieuChung.chuPhu}>Tích điểm cho {soDienThoai}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: MauQuan.ink }}>
              Tổng {tienVnd(gio.subtotal)}
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              accessibilityLabel="Đặt món"
              accessibilityRole="button"
              disabled={dangGui || conMonHet}
              onPress={() => void dat()}
              style={[kieuChung.nutChinh, dangGui || conMonHet ? kieuChung.nutTat : null]}
            >
              <Text style={kieuChung.chuNutChinh}>{dangGui ? 'Đang gửi…' : 'Đặt món'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

interface DongMonProps {
  mon: CartItem;
  dangGui: boolean;
  onDoi: (menuItemId: string, delta: number) => Promise<void>;
}

function DongMon({ mon: i, dangGui, onDoi }: DongMonProps) {
  return (
    <View style={[kieuChung.the, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>{i.name}</Text>
        {i.isAvailable ? (
          <Text style={kieuChung.chuPhu}>{tienVnd(i.price)}</Text>
        ) : (
          <Text style={{ color: MauQuan.danger, fontSize: 13 }}>Vừa hết hàng</Text>
        )}
      </View>
      <TouchableOpacity
        accessibilityLabel={`Bớt ${i.name}`}
        accessibilityRole="button"
        disabled={dangGui}
        onPress={() => void onDoi(i.menuItemId, -1)}
        style={[kieuChung.nutVien, { paddingHorizontal: 14, paddingVertical: 8 }]}
      >
        <Text style={kieuChung.chuNutVien}>−</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 16, color: MauQuan.ink, minWidth: 20, textAlign: 'center' }}>
        {i.quantity}
      </Text>
      <TouchableOpacity
        accessibilityLabel={`Thêm ${i.name}`}
        accessibilityRole="button"
        // Không cho tăng món đã hết — backend sẽ từ chối, và một nút bấm được nhưng không làm gì
        // là cách chắc chắn để khách bấm mãi.
        disabled={dangGui || !i.isAvailable}
        onPress={() => void onDoi(i.menuItemId, 1)}
        style={[
          kieuChung.nutVien,
          { paddingHorizontal: 14, paddingVertical: 8 },
          dangGui || !i.isAvailable ? kieuChung.nutTat : null,
        ]}
      >
        <Text style={kieuChung.chuNutVien}>+</Text>
      </TouchableOpacity>
    </View>
  );
}
