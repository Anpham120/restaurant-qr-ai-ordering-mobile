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
  const [dangKy, setDangKy] = useState(false);
  const [hoTen, setHoTen] = useState('');
  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const gui = useCallback(async () => {
    if (dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      onDangNhapXong(
        dangKy
          ? await repository.dangKy(hoTen, email, matKhau)
          : await repository.dangNhap(email, matKhau),
      );
    } catch (error) {
      // Chỉ nuốt AuthException — đó là loại lỗi đã được dịch thành câu người dùng đọc được. Lỗi
      // khác (lập trình sai, kiểu dữ liệu hỏng) phải nổi lên chứ không nằm im trong ô báo lỗi
      // dưới dạng một câu vô nghĩa.
      if (!(error instanceof AuthException)) throw error;
      setLoi(error.message);
    } finally {
      setDangGui(false);
    }
  }, [dangGui, dangKy, email, hoTen, matKhau, onDangNhapXong, repository]);

  /**
   * Đổi giữa hai chế độ.
   *
   * XOÁ câu báo lỗi, giữ nguyên email và mật khẩu đã gõ. Câu lỗi luôn nói về chế độ vừa rời đi
   * ("Email này đã có tài khoản") nên để lại là nói sai; còn bắt gõ lại email khi khách vừa đọc
   * đúng câu đó và bấm sang đăng nhập là bắt làm lại việc vừa làm.
   */
  const doiCheDo = useCallback(() => {
    setDangKy((truoc) => !truoc);
    setLoi(null);
  }, []);

  return (
    <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
      <Text style={kieuChung.tieuDe}>{dangKy ? 'Tạo tài khoản' : 'Đăng nhập'}</Text>

      {dangKy ? (
        <TextInput
          accessibilityLabel="Họ tên"
          autoCorrect={false}
          onChangeText={setHoTen}
          placeholder="Họ tên"
          style={kieuChung.oNhap}
          value={hoTen}
        />
      ) : null}

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
        //
        // `newPassword` khi đang tạo tài khoản để trình quản lý mật khẩu đề nghị sinh mật khẩu
        // mới thay vì điền lại mật khẩu cũ của một tài khoản khác.
        textContentType={dangKy ? 'newPassword' : 'password'}
        value={matKhau}
      />

      {/* Nói TRƯỚC luật 8 ký tự. Để backend trả PASSWORD_TOO_SHORT sau khi khách đã gõ xong cả
          form là bắt họ phát hiện một luật lẽ ra thấy được từ đầu. */}
      {dangKy ? <Text style={kieuChung.chuPhu}>Mật khẩu ít nhất 8 ký tự.</Text> : null}

      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={dangGui}
        onPress={gui}
        style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
      >
        <Text style={kieuChung.chuNutChinh}>
          {dangGui
            ? dangKy
              ? 'Đang tạo tài khoản…'
              : 'Đang đăng nhập…'
            : dangKy
              ? 'Tạo tài khoản'
              : 'Đăng nhập'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        disabled={dangGui}
        onPress={doiCheDo}
        style={{ alignItems: 'center', paddingVertical: 10 }}
      >
        <Text style={{ color: MauQuan.chestnut, fontWeight: '600' }}>
          {dangKy ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo mới'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
