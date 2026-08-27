import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type AuthRepository } from '../core/auth/authRepository';
import { type AuthSession } from '../core/auth/authSession';
import { MauQuan, kieuChung } from './theme';

/**
 * Mở màn chọn tài khoản Google và trả về ID token.
 *
 * Trả `null` khi khách bấm huỷ — huỷ KHÔNG phải lỗi và không được hiện câu báo lỗi nào.
 */
export type LayTokenGoogle = () => Promise<string | null>;

export interface LoginScreenProps {
  repository: AuthRepository;
  onDangNhapXong: (session: AuthSession) => void;
  /**
   * Vắng mặt thì nút Google KHÔNG hiện.
   *
   * Hiện một nút không bấm được còn tệ hơn không có nút: khách sẽ bấm, không thấy gì xảy ra, và
   * kết luận là app hỏng. Máy chủ chưa cấu hình Google thì thà chỉ thấy đường email.
   */
  layTokenGoogle?: LayTokenGoogle | undefined;
}

export function LoginScreen({ repository, onDangNhapXong, layTokenGoogle }: LoginScreenProps) {
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

  const guiGoogle = useCallback(async () => {
    if (dangGui || layTokenGoogle === undefined) return;
    setDangGui(true);
    setLoi(null);
    try {
      const idToken = await layTokenGoogle();
      // Huỷ giữa chừng là chuyện bình thường. Báo lỗi ở đây nghĩa là phạt khách vì đổi ý.
      if (idToken === null) return;
      onDangNhapXong(await repository.dangNhapGoogle(idToken));
    } catch (error) {
      if (!(error instanceof AuthException)) throw error;
      setLoi(error.message);
    } finally {
      setDangGui(false);
    }
  }, [dangGui, layTokenGoogle, onDangNhapXong, repository]);

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

      {/*
        Nút Google đặt DƯỚI đường email, không phải trên.
        Đây là app tích điểm cho một quán ăn, không phải một dịch vụ mà ai cũng đã có sẵn tài
        khoản. Đẩy Google lên đầu ngụ ý đó là đường chính và đường email là hạng hai — trong khi
        khách không có tài khoản Google trên máy sẽ thấy mình bị đẩy vào ngõ cụt.
      */}
      {layTokenGoogle === undefined ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: MauQuan.clayLine }} />
            <Text style={kieuChung.chuPhu}>hoặc</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: MauQuan.clayLine }} />
          </View>

          <TouchableOpacity
            accessibilityLabel="Tiếp tục với Google"
            accessibilityRole="button"
            disabled={dangGui}
            onPress={guiGoogle}
            style={[kieuChung.nutVien, dangGui ? kieuChung.nutTat : null]}
          >
            <Text style={kieuChung.chuNutVien}>Tiếp tục với Google</Text>
          </TouchableOpacity>

          {/* Nói rõ Google KHÔNG tự mang điểm sang. Không nói thì khách đăng nhập Google xong,
              thấy 0 điểm, và tưởng hệ thống nuốt mất điểm của mình. */}
          <Text style={kieuChung.chuPhu}>
            Đăng nhập xong vẫn cần liên kết số điện thoại ở mục Điểm thưởng để nhận điểm cũ.
          </Text>
        </>
      )}

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
