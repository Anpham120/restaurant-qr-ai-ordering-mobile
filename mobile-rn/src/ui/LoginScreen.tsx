import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type AuthRepository } from '../core/auth/authRepository';
import { type AuthSession } from '../core/auth/authSession';
import { MauQuan, kieuChung } from './theme';

export interface LoginScreenProps {
  repository: AuthRepository;
  onDangNhapXong: (session: AuthSession) => void;
}

export function LoginScreen({ repository, onDangNhapXong }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const gui = useCallback(async () => {
    if (dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      onDangNhapXong(await repository.dangNhap(email, matKhau));
    } catch (error) {
      // Chỉ nuốt AuthException — đó là loại lỗi đã được dịch thành câu người dùng đọc được. Lỗi
      // khác (lập trình sai, kiểu dữ liệu hỏng) phải nổi lên chứ không nằm im trong ô báo lỗi
      // dưới dạng một câu vô nghĩa.
      if (!(error instanceof AuthException)) throw error;
      setLoi(error.message);
    } finally {
      setDangGui(false);
    }
  }, [dangGui, email, matKhau, onDangNhapXong, repository]);

  return (
    <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
      <Text style={kieuChung.tieuDe}>Đăng nhập</Text>

      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="email"
        onChangeText={setEmail}
        placeholder="Email"
        style={kieuChung.oNhap}
        value={email}
      />

      <TextInput
        accessibilityLabel="Mật khẩu"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setMatKhau}
        onSubmitEditing={gui}
        placeholder="Mật khẩu"
        secureTextEntry
        style={kieuChung.oNhap}
        // Bàn phím di động lưu lại từ đã gõ để gợi ý. Không tắt thì mật khẩu nằm trong từ điển cá
        // nhân của bàn phím và bật lên ở ô nhập của app khác.
        textContentType="password"
        value={matKhau}
      />

      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={dangGui}
        onPress={gui}
        style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
      >
        <Text style={kieuChung.chuNutChinh}>{dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}</Text>
      </TouchableOpacity>
    </View>
  );
}
