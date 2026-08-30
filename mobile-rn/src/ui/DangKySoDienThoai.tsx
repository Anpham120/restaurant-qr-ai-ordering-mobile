import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type AuthRepository } from '../core/auth/authRepository';
import { type AuthSession } from '../core/auth/authSession';
import { type ChoNhapMa, type GuiMaOtp, sangE164 } from '../core/auth/phoneOtp';
import { MauQuan, kieuChung } from './theme';

export interface DangKySoDienThoaiProps {
  repository: AuthRepository;
  guiMaOtp: GuiMaOtp;
  onDangKyXong: (session: AuthSession) => void;
  onQuayLai: () => void;
}

/**
 * Tạo tài khoản bằng số điện thoại đã xác minh OTP.
 *
 * <p>HAI bước, không phải ba: khách gõ họ tên, số và mật khẩu cùng một lượt rồi mới nhận mã. Tách
 * mật khẩu ra bước riêng sau khi xác minh nghĩa là bắt khách chờ tin nhắn xong mới biết còn phải
 * nghĩ thêm một mật khẩu — và mã OTP thì đang đếm ngược.
 *
 * <p>Chặn số sai định dạng TRƯỚC khi gọi mạng. Firebase trả câu lỗi nói "invalid phone number",
 * nghe như số của khách sai, trong khi thường là app quên đổi sang dạng +84.
 */
export function DangKySoDienThoai(p: DangKySoDienThoaiProps) {
  const [hoTen, setHoTen] = useState('');
  const [so, setSo] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [ma, setMa] = useState('');
  const [cho, setCho] = useState<ChoNhapMa | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  const guiMa = useCallback(async () => {
    if (dangGui) return;

    // Kiểm tại chỗ, theo thứ tự khách gõ — báo một lỗi mỗi lần, ở đúng ô họ vừa rời.
    if (hoTen.trim().length === 0) {
      setLoi('Chưa nhập họ tên.');
      return;
    }
    if (sangE164(so) === null) {
      setLoi('Số điện thoại không hợp lệ. Ví dụ: 0901234567');
      return;
    }
    if (matKhau.length < 8) {
      setLoi('Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }

    setDangGui(true);
    setLoi(null);
    try {
      setCho(await p.guiMaOtp(so));
    } catch {
      // Mọi lỗi ở bước này đều từ phía Firebase hoặc mạng, và khách không tự phân biệt được.
      setLoi('Không gửi được mã xác minh. Kiểm tra số điện thoại và mạng rồi thử lại.');
    } finally {
      setDangGui(false);
    }
  }, [dangGui, hoTen, matKhau.length, p, so]);

  const xacNhan = useCallback(async () => {
    if (dangGui || cho === null) return;
    setDangGui(true);
    setLoi(null);
    try {
      const phoneIdToken = await cho.xacNhan(ma.trim());
      p.onDangKyXong(await p.repository.dangKy(hoTen, phoneIdToken, so, matKhau));
    } catch (e) {
      // AuthException là lỗi của máy chủ, đã dịch sẵn (số đã có tài khoản, máy chủ chưa cấu hình
      // Firebase…). Lỗi KHÁC ở đây gần như luôn là mã sai hoặc hết hạn, và thư viện báo bằng
      // tiếng Anh cho lập trình viên.
      setLoi(
        e instanceof AuthException
          ? e.message
          : 'Mã xác minh không đúng hoặc đã hết hạn. Nhận mã mới rồi thử lại.',
      );
    } finally {
      setDangGui(false);
    }
  }, [cho, dangGui, hoTen, ma, matKhau, p, so]);

  /** Quay lại bước nhập số. GIỮ nguyên mọi thứ đã gõ, chỉ bỏ lượt chờ mã và câu lỗi cũ. */
  const doiSo = useCallback(() => {
    setCho(null);
    setMa('');
    setLoi(null);
  }, []);

  return (
    <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
      <Text style={kieuChung.tieuDe}>Tạo tài khoản</Text>

      {cho === null ? (
        <>
          <TextInput
            accessibilityLabel="Họ tên"
            autoCorrect={false}
            onChangeText={setHoTen}
            placeholder="Họ tên"
            style={kieuChung.oNhap}
            value={hoTen}
          />

          <TextInput
            accessibilityLabel="Số điện thoại"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="tel"
            onChangeText={setSo}
            placeholder="Số điện thoại"
            style={kieuChung.oNhap}
            value={so}
          />

          <TextInput
            accessibilityLabel="Mật khẩu"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setMatKhau}
            placeholder="Mật khẩu"
            secureTextEntry
            style={kieuChung.oNhap}
            // Bàn phím di động lưu từ đã gõ để gợi ý; không tắt thì mật khẩu nằm trong từ điển cá
            // nhân và bật lên ở ô nhập của app khác.
            textContentType="newPassword"
            value={matKhau}
          />

          {/* Nói TRƯỚC luật 8 ký tự, đừng để khách gõ xong cả form mới biết. */}
          <Text style={kieuChung.chuPhu}>Mật khẩu ít nhất 8 ký tự.</Text>

          {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={dangGui}
            onPress={guiMa}
            style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
          >
            <Text style={kieuChung.chuNutChinh}>
              {dangGui ? 'Đang gửi mã…' : 'Nhận mã xác minh'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {/* Nhắc lại số vừa gõ. Khách chờ tin nhắn mà không thấy số nào trên màn hình thì không
              biết mình có gõ nhầm một chữ số hay không. */}
          <Text style={kieuChung.chuPhu}>Đã gửi mã tới {so}.</Text>

          <TextInput
            accessibilityLabel="Mã xác minh"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="numeric"
            maxLength={6}
            onChangeText={setMa}
            onSubmitEditing={xacNhan}
            placeholder="Mã 6 chữ số"
            style={kieuChung.oNhap}
            value={ma}
          />

          {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={dangGui}
            onPress={xacNhan}
            style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
          >
            <Text style={kieuChung.chuNutChinh}>
              {dangGui ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            disabled={dangGui}
            onPress={doiSo}
            style={{ alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ color: MauQuan.chestnut, fontWeight: '600' }}>Đổi số điện thoại</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        disabled={dangGui}
        onPress={p.onQuayLai}
        style={{ alignItems: 'center', paddingVertical: 10 }}
      >
        <Text style={{ color: MauQuan.chestnut, fontWeight: '600' }}>Đã có tài khoản? Đăng nhập</Text>
      </TouchableOpacity>
    </View>
  );
}
