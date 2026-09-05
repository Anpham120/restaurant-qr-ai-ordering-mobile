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
   * kết luận là app hỏng. Máy chủ chưa cấu hình Google thì thà chỉ thấy ô mật khẩu.
   */
  layTokenGoogle?: LayTokenGoogle | undefined;
  /**
   * Mở màn tạo tài khoản bằng số điện thoại. Vắng mặt thì đường đó KHÔNG hiện.
   *
   * Cùng luật với `layTokenGoogle`: chưa có thư viện OTP thì thà không có nút, còn hơn để khách
   * bấm vào một màn không chạy được.
   */
  onTaoTaiKhoan?: (() => void) | undefined;
}

/**
 * Màn đăng nhập. KHÔNG có chế độ tạo tài khoản bằng email.
 *
 * Backend đã bỏ hẳn đường đó: `/api/auth/register` chỉ nhận `phoneIdToken` — số điện thoại đã
 * xác minh OTP — vì điểm thưởng tính theo số, nên nhận một số chưa xác minh nghĩa là cho người lạ
 * chiếm hồ sơ điểm của khách quen. Nút "Tạo mới" cũ gửi email lên và nhận về 400
 * PHONE_TOKEN_REQUIRED mọi lần, không có ca nào chạy được.
 *
 * Đường tạo tài khoản đang dùng được là Google. Đường số điện thoại cần màn nhập OTP, chưa dựng.
 */
export function LoginScreen({
  repository,
  onDangNhapXong,
  layTokenGoogle,
  onTaoTaiKhoan,
}: LoginScreenProps) {
  const [dinhDanh, setDinhDanh] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const gui = useCallback(async () => {
    if (dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      onDangNhapXong(await repository.dangNhap(dinhDanh, matKhau));
    } catch (error) {
      // Chỉ nuốt AuthException — đó là loại lỗi đã được dịch thành câu người dùng đọc được. Lỗi
      // khác (lập trình sai, kiểu dữ liệu hỏng) phải nổi lên chứ không nằm im trong ô báo lỗi
      // dưới dạng một câu vô nghĩa.
      if (!(error instanceof AuthException)) throw error;
      setLoi(error.message);
    } finally {
      setDangGui(false);
    }
  }, [dangGui, dinhDanh, matKhau, onDangNhapXong, repository]);

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

  return (
    <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
      <Text style={kieuChung.tieuDe}>Đăng nhập</Text>

      {/*
        MỘT ô cho cả hai loại người dùng — khách gõ số điện thoại, nhân viên gõ email — vì backend
        nhận cả hai vào cùng một trường `identifier`.

        `inputMode` để "text", KHÔNG phải "email" hay "tel": một ô nhận hai dạng thì không có bàn
        phím nào đúng cho cả hai, và mở bàn phím số cho người sắp gõ email là bắt họ đi tìm nút
        chuyển ngay ở thao tác đầu tiên.
      */}
      <TextInput
        accessibilityLabel="Số điện thoại hoặc email"
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="text"
        onChangeText={setDinhDanh}
        placeholder="Số điện thoại hoặc email"
        style={kieuChung.oNhap}
        value={dinhDanh}
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

      {/*
        Nút Google đặt DƯỚI ô mật khẩu, không phải trên.
        Đây là app tích điểm cho một quán ăn, không phải một dịch vụ mà ai cũng đã có sẵn tài
        khoản. Đẩy Google lên đầu ngụ ý đó là đường chính và đường mật khẩu là hạng hai — trong khi
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

      {/* Nói khách chưa có tài khoản thì làm gì. Bỏ trống chỗ này là để họ tự đoán, và đoán sai
          thành ra gõ đại một số vào ô trên rồi nhận "không đúng" mãi.

          Ba trạng thái, không phải hai: có OTP thì đưa vào màn đăng ký; không có OTP nhưng có
          Google thì chỉ sang nút Google; không có gì thì im lặng — chỉ đường tới một cửa không
          tồn tại còn tệ hơn không nói gì. */}
      {onTaoTaiKhoan !== undefined ? (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={dangGui}
          onPress={onTaoTaiKhoan}
          style={{ alignItems: 'center', paddingVertical: 10 }}
        >
          <Text style={{ color: MauQuan.chestnut, fontWeight: '600' }}>
            Chưa có tài khoản? Tạo bằng số điện thoại
          </Text>
        </TouchableOpacity>
      ) : layTokenGoogle !== undefined ? (
        <Text style={[kieuChung.chuPhu, { textAlign: 'center', paddingVertical: 10 }]}>
          Chưa có tài khoản? Bấm “Tiếp tục với Google” ở trên để tạo.
        </Text>
      ) : null}
    </View>
  );
}
