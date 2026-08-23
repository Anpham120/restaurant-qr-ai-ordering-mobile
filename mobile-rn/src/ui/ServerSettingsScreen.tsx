import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { type CauHinhMayChu, chuanHoaDiaChi, suyRaDiaChiAnh } from '../core/cauHinh/cauHinh';
import { kieuChung } from './theme';

/** Cho test tiêm bản giả; mặc định dùng `fetch` thật. */
export type GoiMang = (url: string, init?: RequestInit) => Promise<{ status: number }>;

export interface ServerSettingsScreenProps {
  hienTai: CauHinhMayChu;
  onLuu: (moi: CauHinhMayChu) => Promise<void>;
  /** `true` khi app chưa có cấu hình nào — không cho thoát ra màn hình trống. */
  batBuoc?: boolean;
  goiMang?: GoiMang;
}

const HET_GIO_MS = 5000;

/**
 * Nhập địa chỉ máy chủ (§9.10 — kiểm thử trên thiết bị thật).
 *
 * Vì sao màn hình này tồn tại: biến đặt lúc dựng là compile-time, nên một bản dựng ở CI mang sẵn
 * `10.0.2.2` — địa chỉ chỉ có nghĩa **bên trong máy ảo Android**. Cắm bản đó vào điện thoại thật
 * thì mọi lời gọi đi vào hư không, và không có cách nào sửa mà không dựng lại.
 */
export function ServerSettingsScreen({
  hienTai,
  onLuu,
  batBuoc = false,
  goiMang,
}: ServerSettingsScreenProps) {
  const [api, setApi] = useState(hienTai.apiBaseUrl);
  const [anh, setAnh] = useState(hienTai.imageBaseUrl);
  const [ketQua, setKetQua] = useState<string | null>(null);
  const [dangKiemTra, setDangKiemTra] = useState(false);

  /** Người dùng đã tự sửa ô ảnh chưa. Chưa sửa thì ô ảnh đi theo ô API. */
  const tuSuaAnh = useRef(false);

  /**
   * Ô ảnh tự đi theo ô API cho tới khi người dùng tự gõ vào nó.
   *
   * Bắt gõ hai địa chỉ gần giống hệt nhau trên bàn phím điện thoại là cách chắc chắn để có một
   * cái đúng và một cái sai — và cái sai sẽ biểu hiện thành "thực đơn không có ảnh", triệu chứng
   * không dẫn về nguyên nhân.
   */
  const doiApi = useCallback((giaTri: string) => {
    setApi(giaTri);
    if (tuSuaAnh.current) return;
    const chuan = chuanHoaDiaChi(giaTri, 8081);
    if (chuan === null) return;
    setAnh(suyRaDiaChiAnh(chuan));
  }, []);

  const kiemTra = useCallback(async () => {
    const chuan = chuanHoaDiaChi(api, 8081);
    if (chuan === null) {
      setKetQua('Địa chỉ không hợp lệ.');
      return;
    }
    setDangKiemTra(true);
    setKetQua(null);
    // `fetch` của React Native không có tuỳ chọn hết giờ. Thiếu nó, một IP sai trong mạng LAN
    // treo nút "Đang gọi…" cho tới khi TCP tự bỏ cuộc — có thể hơn một phút, và người dùng sẽ
    // kết luận app hỏng chứ không kết luận địa chỉ sai.
    const dungLai = new AbortController();
    const hen = setTimeout(() => dungLai.abort(), HET_GIO_MS);
    try {
      const goi = goiMang ?? fetch;
      const res = await goi(`${chuan}/api/health`, { signal: dungLai.signal });
      setKetQua(
        res.status === 200
          ? 'Kết nối được. Máy chủ trả lời.'
          : `Máy chủ trả mã ${res.status}. Kiểm tra lại cổng.`,
      );
    } catch {
      // Câu này phải kể ra ba nguyên nhân thật, vì cả ba đều hay xảy ra và khách không tự đoán
      // được cái nào: sai IP, khác wifi, hoặc backend chưa chạy.
      setKetQua(
        'Không gọi được. Kiểm tra: điện thoại và máy chủ có cùng wifi không, ' +
          'IP có đúng không, backend có đang chạy không.',
      );
    } finally {
      clearTimeout(hen);
      setDangKiemTra(false);
    }
  }, [api, goiMang]);

  const luu = useCallback(async () => {
    const chuanApi = chuanHoaDiaChi(api, 8081);
    const chuanAnh = chuanHoaDiaChi(anh, 8080);
    if (chuanApi === null || chuanAnh === null) {
      setKetQua('Địa chỉ không hợp lệ.');
      return;
    }
    await onLuu({ apiBaseUrl: chuanApi, imageBaseUrl: chuanAnh });
  }, [api, anh, onLuu]);

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={kieuChung.than}>
      <Text style={kieuChung.tieuDe}>Máy chủ</Text>
      <Text style={kieuChung.chu}>
        Nhập địa chỉ máy chạy backend. Điện thoại và máy đó phải cùng một wifi.
        {'\n\n'}
        Máy ảo Android dùng 10.0.2.2. Điện thoại thật dùng IP LAN của máy (Windows: ipconfig,
        macOS/Linux: ifconfig).
      </Text>

      <View>
        <Text style={kieuChung.nhan}>Địa chỉ API</Text>
        <TextInput
          accessibilityLabel="Địa chỉ API"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onChangeText={doiApi}
          placeholder="192.168.1.5"
          style={kieuChung.oNhap}
          value={api}
        />
        <Text style={kieuChung.chuPhu}>Thiếu cổng thì tự thêm :8081</Text>
      </View>

      <View>
        <Text style={kieuChung.nhan}>Địa chỉ ảnh món</Text>
        <TextInput
          accessibilityLabel="Địa chỉ ảnh món"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onChangeText={(v) => {
            tuSuaAnh.current = true;
            setAnh(v);
          }}
          style={kieuChung.oNhap}
          value={anh}
        />
        <Text style={kieuChung.chuPhu}>
          Tự đi theo ô trên. Ảnh do web phục vụ ở cổng 8080, không phải API.
        </Text>
      </View>

      {ketQua !== null ? <Text style={kieuChung.chu}>{ketQua}</Text> : null}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={dangKiemTra}
        onPress={kiemTra}
        style={[kieuChung.nutVien, dangKiemTra ? kieuChung.nutTat : null]}
      >
        <Text style={kieuChung.chuNutVien}>{dangKiemTra ? 'Đang gọi…' : 'Kiểm tra kết nối'}</Text>
      </TouchableOpacity>

      <TouchableOpacity accessibilityRole="button" onPress={luu} style={kieuChung.nutChinh}>
        <Text style={kieuChung.chuNutChinh}>Lưu</Text>
      </TouchableOpacity>

      <Text style={kieuChung.chuPhu}>
        Đổi máy chủ sẽ thoát phiên bàn và đăng nhập hiện tại: token của máy chủ cũ không dùng được ở
        máy chủ mới.
      </Text>
      {batBuoc ? (
        <Text style={kieuChung.chuPhu}>
          Chưa có cấu hình nào nên chưa thoát được màn hình này — thoát ra sẽ là một màn hình không
          gọi được gì.
        </Text>
      ) : null}
    </ScrollView>
  );
}
