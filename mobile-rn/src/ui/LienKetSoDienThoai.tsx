import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type MyLoyalty } from '../core/loyalty/loyalty';
import { type LoyaltyApi } from '../core/loyalty/loyaltyApi';
import { MauQuan, kieuChung } from './theme';

export interface LienKetSoDienThoaiProps {
  accessToken: string;
  api: LoyaltyApi;
  /** Gọi khi nối xong, kèm hồ sơ điểm mới đọc được. */
  onNoiXong: (diem: MyLoyalty) => void;
  /** Lỗi KHÔNG dịch được thành câu người dùng đọc — để màn cha dựng lại hoặc báo hỏng. */
  onLoiNang: (loi: unknown) => void;
}

/**
 * Nối số điện thoại vào tài khoản.
 *
 * Tách khỏi màn Điểm thưởng vì nó xuất hiện ở HAI nơi: trong hồ sơ tài khoản (nơi khách chủ động
 * vào để liên kết) và trong màn Điểm thưởng (nơi khách phát hiện mình chưa liên kết). Chép hai bản
 * nghĩa là hai bản sẽ trôi khỏi nhau — và ở đây điều đó nguy hiểm, vì nhánh xử lý
 * `LOYALTY_PHONE_ALREADY_MEMBER` là đường DUY NHẤT khách quen cũ lấy lại được điểm.
 *
 * Tự giữ trạng thái của mình. Màn cha chỉ nhận kết quả.
 */
export function LienKetSoDienThoai(p: LienKetSoDienThoaiProps) {
  const [so, setSo] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [maNoiSo, setMaNoiSo] = useState<string | null>(null);

  const noiSo = useCallback(async () => {
    if (dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      p.onNoiXong(await p.api.noiSo(p.accessToken, so));
    } catch (e) {
      if (!(e instanceof AuthException)) {
        p.onLoiNang(e);
        return;
      }
      setLoi(e.message);
      // Số đã có hồ sơ từ trước là đường của khách quen CŨ, không phải lỗi gõ nhầm. Đưa luôn mã
      // để họ đọc ở quầy, thay vì để họ gõ lại số mãi.
      if (e.code === 'LOYALTY_PHONE_ALREADY_MEMBER') {
        try {
          setMaNoiSo((await p.api.xinMaNoiSo(p.accessToken)).ma);
        } catch {
          // Không xin được mã thì câu hướng dẫn ở trên vẫn còn; đừng nuốt nó bằng một lỗi khác.
        }
      }
    } finally {
      setDangGui(false);
    }
  }, [dangGui, p, so]);

  return (
    <>
      <Text style={{ fontSize: 16, fontWeight: '700', color: MauQuan.ink }}>
        Liên kết số điện thoại
      </Text>
      {/* Nói TRƯỚC giới hạn, thay vì để khách gõ số rồi mới nhận lỗi khó hiểu. */}
      <Text style={kieuChung.chu}>
        Điểm thưởng được tính theo số điện thoại bạn dùng khi thanh toán.
        {'\n'}
        Nếu số này đã từng tích điểm, nhờ nhân viên tại quầy nối hộ.
      </Text>

      <View>
        <Text style={kieuChung.nhan}>Số điện thoại</Text>
        <TextInput
          accessibilityLabel="Số điện thoại"
          autoCorrect={false}
          inputMode="tel"
          onChangeText={setSo}
          onSubmitEditing={() => void noiSo()}
          style={kieuChung.oNhap}
          value={so}
        />
      </View>

      <TouchableOpacity
        accessibilityLabel="Liên kết"
        accessibilityRole="button"
        disabled={dangGui}
        onPress={() => void noiSo()}
        style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
      >
        <Text style={kieuChung.chuNutChinh}>{dangGui ? 'Đang liên kết…' : 'Liên kết'}</Text>
      </TouchableOpacity>

      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

      {maNoiSo === null ? null : (
        <View style={[kieuChung.the, { gap: 6, alignItems: 'center' }]}>
          <Text style={kieuChung.chuPhu}>Đọc mã này cho nhân viên tại quầy</Text>
          <Text
            accessibilityLabel={`Mã nối tài khoản ${maNoiSo.split('').join(' ')}`}
            selectable
            style={{
              fontSize: 32,
              fontWeight: '700',
              letterSpacing: 6,
              color: MauQuan.chestnut,
            }}
          >
            {maNoiSo}
          </Text>
          <Text style={kieuChung.chuPhu}>Mã sống 5 phút và chỉ dùng được một lần.</Text>
        </View>
      )}
    </>
  );
}
