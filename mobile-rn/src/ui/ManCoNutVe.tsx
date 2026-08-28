import { Text, TouchableOpacity, View } from 'react-native';

import { MauQuan, kieuChung } from './theme';

/**
 * Màn con có một nút quay lại ở đầu.
 *
 * Ở tệp riêng vì hồ sơ tài khoản mở được từ HAI nơi: trong tab Tài khoản (đang ngồi bàn) và ngoài
 * phiên bàn (vừa đăng nhập, chưa quét QR). Cả hai đều cần một đường lùi, và hai bản chép tay sẽ
 * lệch nhau về khoảng cách lẫn nhãn.
 */
export function ManCoNutVe({ children, onVe }: { children: React.ReactNode; onVe: () => void }) {
  return (
    <View style={kieuChung.man}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: MauQuan.clayLine }}>
        <TouchableOpacity
          accessibilityLabel="Quay lại"
          accessibilityRole="button"
          onPress={onVe}
          style={{ alignSelf: 'flex-start' }}
        >
          <Text style={kieuChung.chuNutVien}>‹ Quay lại</Text>
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}
