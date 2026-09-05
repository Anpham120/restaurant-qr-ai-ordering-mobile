import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type ChoNhapMa, type GuiMaOtp } from '../core/auth/phoneOtp';
import { type MyLoyalty } from '../core/loyalty/loyalty';
import { type LoyaltyApi } from '../core/loyalty/loyaltyApi';
import { MauQuan, kieuChung } from './theme';

export interface LienKetSoDienThoaiProps {
  accessToken: string;
  api: LoyaltyApi;
  /**
   * Gửi mã OTP. Cùng hàm màn đăng ký dùng — không có bản thứ hai.
   *
   * `undefined` khi thư viện native vắng mặt (Expo Go). KHÔNG để tuỳ chọn: mọi nơi gọi phải nói rõ
   * có hay không, để không ai quên truyền rồi vô tình rơi vào nhánh không liên kết được.
   */
  guiMaOtp: GuiMaOtp | undefined;
  /** Gọi khi nối xong, kèm hồ sơ điểm mới đọc được. */
  onNoiXong: (diem: MyLoyalty) => void;
  /** Lỗi KHÔNG dịch được thành câu người dùng đọc — để màn cha dựng lại hoặc báo hỏng. */
  onLoiNang: (loi: unknown) => void;
}

/**
 * Nối số điện thoại vào tài khoản, xác minh bằng OTP.
 *
 * Tách khỏi màn Điểm thưởng vì nó xuất hiện ở HAI nơi: trong hồ sơ tài khoản (nơi khách chủ động
 * vào để liên kết) và trong màn Điểm thưởng (nơi khách phát hiện mình chưa liên kết). Chép hai bản
 * nghĩa là hai bản sẽ trôi khỏi nhau.
 *
 * NGHIỆP VỤ ĐÃ ĐỔI: khách tự tải app, tự tạo tài khoản, TỰ NỐI SỐ. Bản trước gửi số trần lên máy
 * chủ, nên máy chủ phải từ chối mọi số ĐÃ có hồ sơ điểm — nhận một số chưa chứng minh là cho người
 * lạ gõ số của khách quen rồi lấy điểm. Cái từ chối đó rơi đúng vào ca phổ biến nhất, và đường vòng
 * duy nhất là ra quầy đọc mã sáu chữ số cho nhân viên nối hộ.
 *
 * Giờ nối bằng OTP: token chứng minh khách sở hữu SỐ — đúng thứ cần chứng minh, và chặt hơn hẳn mã
 * sáu số cũ, thứ chỉ chứng minh khách sở hữu TÀI KHOẢN.
 *
 * Hai bước trong một màn: gõ số rồi gõ mã. Không tách màn vì khách đang ở giữa một việc.
 */
export function LienKetSoDienThoai(p: LienKetSoDienThoaiProps) {
  const [so, setSo] = useState('');
  const [ma, setMa] = useState('');
  const [dangCho, setDangCho] = useState<ChoNhapMa | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const guiMa = useCallback(async () => {
    if (dangGui || p.guiMaOtp === undefined) return;
    setDangGui(true);
    setLoi(null);
    try {
      setDangCho(await p.guiMaOtp(so));
    } catch (e) {
      // Số sai định dạng là lỗi của khách và sửa được tại chỗ; mọi thứ khác đẩy lên màn cha.
      if (e instanceof Error && e.message === 'SO_DIEN_THOAI_KHONG_HOP_LE') {
        setLoi('Số điện thoại không hợp lệ.');
        return;
      }
      p.onLoiNang(e);
    } finally {
      setDangGui(false);
    }
  }, [dangGui, p, so]);

  const xacNhanVaNoi = useCallback(async () => {
    if (dangGui || dangCho === null) return;
    setDangGui(true);
    setLoi(null);
    try {
      const token = await dangCho.xacNhan(ma);
      p.onNoiXong(await p.api.noiSo(p.accessToken, token));
    } catch (e) {
      if (e instanceof AuthException) {
        setLoi(e.message);
        return;
      }
      // Mã sai hoặc hết hạn: cho gõ lại NGAY, đừng bắt xin mã mới — mã cũ còn sống.
      if (e instanceof Error && e.message === 'XAC_MINH_THAT_BAI') {
        setLoi('Mã không đúng hoặc đã hết hạn. Thử lại.');
        return;
      }
      p.onLoiNang(e);
    } finally {
      setDangGui(false);
    }
  }, [dangCho, dangGui, ma, p]);

  return (
    <>
      <Text style={{ fontSize: 16, fontWeight: '700', color: MauQuan.ink }}>
        Liên kết số điện thoại
      </Text>
      <Text style={kieuChung.chu}>
        Điểm thưởng được tính theo số điện thoại bạn dùng khi thanh toán.
        {'\n'}
        Nếu số này đã từng tích điểm, điểm sẽ về tài khoản ngay sau khi xác minh.
      </Text>

      {p.guiMaOtp === undefined ? (
        // Nói RÕ vì sao không liên kết được, thay vì hiện một cái nút bấm không ăn thua. Ca này
        // xảy ra trên Expo Go, nơi thư viện native của Firebase không có mặt.
        <Text style={{ color: MauQuan.danger }}>
          Bản dựng này chưa gửi được mã xác minh. Dùng bản cài đặt đầy đủ để liên kết số.
        </Text>
      ) : dangCho === null ? (
        <>
          <View>
            <Text style={kieuChung.nhan}>Số điện thoại</Text>
            <TextInput
              accessibilityLabel="Số điện thoại"
              autoCorrect={false}
              inputMode="tel"
              onChangeText={setSo}
              onSubmitEditing={() => void guiMa()}
              style={kieuChung.oNhap}
              value={so}
            />
          </View>

          <TouchableOpacity
            accessibilityLabel="Gửi mã xác minh"
            accessibilityRole="button"
            disabled={dangGui}
            onPress={() => void guiMa()}
            style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
          >
            <Text style={kieuChung.chuNutChinh}>
              {dangGui ? 'Đang gửi mã…' : 'Gửi mã xác minh'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View>
            {/* Nhắc lại số đã gửi tới: khách gõ mã từ tin nhắn và cần đối chiếu đúng số. */}
            <Text style={kieuChung.nhan}>Mã gửi tới {so}</Text>
            <TextInput
              accessibilityLabel="Mã xác minh"
              autoCorrect={false}
              inputMode="numeric"
              onChangeText={setMa}
              onSubmitEditing={() => void xacNhanVaNoi()}
              style={kieuChung.oNhap}
              value={ma}
            />
          </View>

          <TouchableOpacity
            accessibilityLabel="Xác minh và liên kết"
            accessibilityRole="button"
            disabled={dangGui}
            onPress={() => void xacNhanVaNoi()}
            style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
          >
            <Text style={kieuChung.chuNutChinh}>
              {dangGui ? 'Đang liên kết…' : 'Xác minh và liên kết'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel="Đổi số khác"
            accessibilityRole="button"
            onPress={() => {
              setDangCho(null);
              setMa('');
              setLoi(null);
            }}
          >
            <Text style={kieuChung.chuPhu}>Đổi số khác</Text>
          </TouchableOpacity>
        </>
      )}

      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}
    </>
  );
}
