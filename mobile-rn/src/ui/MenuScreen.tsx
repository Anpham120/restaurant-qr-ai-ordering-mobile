import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AuthException } from '../core/auth/authApi';
import {
  type MenuCategory,
  type MenuItem,
  locMonTheoTen,
  nhomTheoDanhMuc,
  urlAnh,
} from '../core/menu/menu';
import { type MenuApi } from '../core/menu/menuApi';
import { tienVnd } from '../core/tien';
import { BoGoc, MauQuan, kieuChung } from './theme';

export interface MenuScreenProps {
  api: MenuApi;
  /** Base URL của ẢNH — khác base của API. Ảnh do container web phục vụ, không phải backend. */
  imageBaseUrl: string;
  /** Thêm món vào giỏ. Bỏ trống thì thẻ không có nút thêm (dùng khi chỉ xem). */
  onThemVaoGio?: (menuItemId: string) => Promise<void>;
  /**
   * Báo tin ra ngoài để màn hình cha hiện lên.
   *
   * Bản Flutter gọi thẳng `ScaffoldMessenger` từ trong màn này. Ở React Native không có thứ tương
   * đương sẵn có, và đẩy ra ngoài còn tiện hơn: test đọc được lời báo mà không phải dựng cả một
   * tầng thông báo giả.
   */
  onBaoTin?: (loi: string) => void;
}

const CAO_ANH = 168;

/**
 * Thực đơn — xem được KHÔNG cần đang ở bàn (§9.10 M1 mục 4).
 *
 * Bố cục chép theo thẻ món của web (`.cmc-menu-card`): ảnh lớn phía trên, tên, mô tả, rồi hàng
 * cuối gồm giá và nút thêm.
 */
export function MenuScreen({ api, imageBaseUrl, onThemVaoGio, onBaoTin }: MenuScreenProps) {
  const [danhMuc, setDanhMuc] = useState<readonly MenuCategory[]>([]);
  const [mon, setMon] = useState<readonly MenuItem[]>([]);
  const [tim, setTim] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [daTai, setDaTai] = useState(false);
  const [dangThem, setDangThem] = useState<string | null>(null);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  type KetQua =
    | {
        readonly ok: true;
        readonly categories: readonly MenuCategory[];
        readonly items: readonly MenuItem[];
      }
    | { readonly ok: false; readonly loi: string }
    | { readonly ok: false; readonly loiNang: unknown };

  const napDuLieu = useCallback(async (): Promise<KetQua> => {
    try {
      const data = await api.thucDon();
      return { ok: true, categories: data.categories, items: data.items };
    } catch (e) {
      // Chỉ nuốt AuthException — đó là loại lỗi đã dịch thành câu người dùng đọc được.
      //
      // KHÔNG `throw e` ở đây. Hàm này chạy trong một Promise mà effect gọi bằng `void`, nên
      // ném lại chỉ biến lỗi thành unhandled rejection: vẫn bị nuốt, chỉ theo cách khó thấy hơn.
      // Trả nó ra để component ném LÚC DỰNG GIAO DIỆN, nơi error boundary của React bắt được.
      if (!(e instanceof AuthException)) return { ok: false, loiNang: e };
      return { ok: false, loi: e.message };
    }
  }, [api]);

  const apDung = useCallback((kq: KetQua) => {
    if (!kq.ok && 'loiNang' in kq) {
      setLoiNang(kq.loiNang);
      setDaTai(true);
      return;
    }
    if (kq.ok) {
      setDanhMuc(kq.categories);
      setMon(kq.items);
      // Xoá lỗi lúc dữ liệu MỚI về, không phải lúc bắt đầu gọi: bấm "Thử lại" mà mạng vẫn hỏng
      // thì câu báo lỗi ở nguyên, không nháy trắng rồi hiện lại.
      setLoi(null);
    } else {
      setLoi(kq.loi);
    }
    setDaTai(true);
  }, []);

  const tai = useCallback(async () => {
    apDung(await napDuLieu());
  }, [apDung, napDuLieu]);

  // Tách việc LẤY dữ liệu khỏi việc ÁP dữ liệu để lượt nạp đầu tiên đặt trạng thái từ trong một
  // callback của Promise — đúng khuôn mà eslint react-hooks chờ đợi, thay vì gọi thẳng một hàm
  // có setState ngay trong thân effect.
  //
  // Cờ `huy` không phải làm cho có: người dùng đổi tab trong lúc thực đơn còn đang tải là
  // chuyện thường, và đặt trạng thái cho một màn hình đã rời đi là rò rỉ không ai nhìn thấy.
  useEffect(() => {
    let huy = false;
    void napDuLieu().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, napDuLieu]);

  /** Lọc theo từ khoá, bỏ dấu — bàn phím điện thoại thường không có bộ gõ tiếng Việt. */
  const nhom = useMemo(() => {
    const khoa = tim.trim();
    return nhomTheoDanhMuc(danhMuc, khoa.length === 0 ? mon : locMonTheoTen(mon, khoa));
  }, [danhMuc, mon, tim]);

  const them = useCallback(
    async (m: MenuItem) => {
      if (onThemVaoGio === undefined || dangThem !== null) return;
      setDangThem(m.id);
      try {
        await onThemVaoGio(m.id);
        onBaoTin?.(`Đã thêm ${m.name} vào giỏ`);
      } catch (e) {
        if (!(e instanceof AuthException)) throw e;
        onBaoTin?.(e.message);
      } finally {
        setDangThem(null);
      }
    },
    [dangThem, onBaoTin, onThemVaoGio],
  );

  // Ném lúc dựng giao diện, không ném trong callback bất đồng bộ. Đây là đường duy nhất để một
  // lỗi lập trình đi tới error boundary thay vì tan vào một unhandled rejection mà chỉ có log
  // nhìn thấy.
  if (loiNang !== null) throw loiNang;

  if (loi !== null) {
    return (
      <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
        <Text style={{ color: MauQuan.danger }}>{loi}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={tai} style={kieuChung.nutVien}>
          <Text style={kieuChung.chuNutVien}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={kieuChung.man}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={kieuChung.tieuDe}>Thực đơn</Text>
        <TextInput
          accessibilityLabel="Tìm món"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setTim}
          placeholder="Tìm món — gõ không dấu cũng được"
          returnKeyType="search"
          style={kieuChung.oNhap}
          value={tim}
        />
      </View>

      {!daTai ? (
        <ActivityIndicator color={MauQuan.chestnut} />
      ) : nhom.length === 0 ? (
        <Text style={[kieuChung.chuPhu, { padding: 32, textAlign: 'center' }]}>
          {tim.trim().length === 0 ? 'Thực đơn đang trống.' : `Không có món nào khớp "${tim}".`}
        </Text>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          data={nhom}
          keyExtractor={(n) => n.tenDanhMuc}
          refreshControl={<RefreshControl onRefresh={tai} refreshing={false} />}
          renderItem={({ item: n, index }) => (
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: index === 0 ? 8 : 24,
                  marginBottom: 12,
                }}
              >
                <View style={{ width: 3, height: 18, backgroundColor: MauQuan.brass }} />
                <Text style={{ fontSize: 17, fontWeight: '700', color: MauQuan.ink }}>
                  {n.tenDanhMuc}
                </Text>
                <Text style={{ fontSize: 12, color: MauQuan.muted }}>{n.mon.length} món</Text>
              </View>
              {n.mon.map((m) => (
                <TheMon
                  dangThem={dangThem}
                  imageBaseUrl={imageBaseUrl}
                  key={m.id}
                  mon={m}
                  onThem={onThemVaoGio === undefined ? undefined : them}
                />
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

interface TheMonProps {
  mon: MenuItem;
  imageBaseUrl: string;
  dangThem: string | null;
  // `| undefined` là bắt buộc dưới `exactOptionalPropertyTypes`: truyền thẳng một biến có
  // thể undefined vào một prop chỉ khai `?` là lỗi kiểu. Cờ đó bật ở PR nền và vừa bắt đúng ca
  // này.
  onThem?: ((m: MenuItem) => Promise<void>) | undefined;
}

/** Thẻ món — bố cục theo `.cmc-menu-card` của web. */
function TheMon({ mon: m, imageBaseUrl, dangThem, onThem }: TheMonProps) {
  const [anhHong, setAnhHong] = useState(false);
  const anh = urlAnh(m.imageUrl, imageBaseUrl);
  const con = m.isAvailable;
  const goBoTren = { borderTopLeftRadius: BoGoc.the, borderTopRightRadius: BoGoc.the };

  return (
    <View
      // Web dùng `opacity: .65` cho món hết. Giữ món trong danh sách, chỉ làm mờ: lọc đi thì
      // khách tưởng quán không bán món đó.
      style={[kieuChung.the, { opacity: con ? 1 : 0.65, padding: 0, marginBottom: 12 }]}
    >
      {anh !== null ? (
        <View>
          {anhHong ? (
            // Ảnh hỏng KHÔNG được làm sập thẻ: tên và giá mới là thứ khách cần. Hiện một ô nền
            // ấm thay vì khoảng trắng vô nghĩa.
            <View
              accessibilityLabel="Ảnh món không tải được"
              style={[{ height: CAO_ANH, backgroundColor: MauQuan.beige }, goBoTren]}
            />
          ) : (
            <Image
              accessibilityLabel={`Ảnh ${m.name}`}
              onError={() => setAnhHong(true)}
              source={{ uri: anh }}
              style={[{ width: '100%', height: CAO_ANH }, goBoTren]}
            />
          )}
          {!con ? (
            <View
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                backgroundColor: MauQuan.danger,
                borderRadius: BoGoc.nho,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ color: MauQuan.trang, fontSize: 11 }}>Hết hàng</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ padding: 14, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: MauQuan.ink }}>{m.name}</Text>
        {m.description !== null && m.description.length > 0 ? (
          <Text numberOfLines={2} style={kieuChung.chuPhu}>
            {m.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: MauQuan.chestnut }}>
            {tienVnd(m.price)}
          </Text>
          <View style={{ flex: 1 }} />
          {onThem !== undefined ? (
            <TouchableOpacity
              accessibilityLabel={`Thêm ${m.name}`}
              accessibilityRole="button"
              disabled={!con || dangThem !== null}
              onPress={() => void onThem(m)}
              style={[
                kieuChung.nutChinh,
                { paddingHorizontal: 18, paddingVertical: 10 },
                !con || dangThem !== null ? kieuChung.nutTat : null,
              ]}
            >
              <Text style={kieuChung.chuNutChinh}>{dangThem === m.id ? 'Đang thêm…' : 'Thêm'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}
