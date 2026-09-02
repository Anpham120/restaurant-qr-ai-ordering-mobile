import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type AuthSession, danhTinh } from '../core/auth/authSession';
import { type TableSession } from '../core/tables/tableSession';
import { type TableSessionRepository } from '../core/tables/tableSessionRepository';
import { phanTichQrBan } from '../core/tables/quetQr';
import { QrScanScreen } from './QrScanScreen';
import { MauQuan, kieuChung } from './theme';

export interface OpenTableScreenProps {
  repository: TableSessionRepository;
  onMoPhienXong: (phien: TableSession) => void;
  /** Phiên đăng nhập hiện tại, chỉ dùng để nói cho khách biết đơn có được gắn tài khoản không. */
  dangNhapVoi?: AuthSession | null | undefined;
  /** Số đã liên kết. `null` khi chưa liên kết — lúc đó điểm KHÔNG cộng đi đâu cả. */
  soDienThoai?: string | null | undefined;
  /** Mở hồ sơ để liên kết số. Vắng mặt thì hộp trạng thái chỉ là chữ. */
  onMoHoSo?: (() => void) | undefined;
  /**
   * Mở màn đăng nhập.
   *
   * Không có nó thì màn này khuyên "đăng nhập trước khi vào bàn" mà không có đường nào để làm
   * theo — đăng nhập chỉ mở được từ tab Tài khoản, tức SAU khi đã vào bàn.
   */
  onDangNhap?: (() => void) | undefined;
}

/**
 * Mở phiên bàn từ mã QR.
 *
 * Quét bằng camera là lối vào CHÍNH — cả hệ thống tên là "gọi món qua QR". Ô nhập tay giữ lại làm
 * phương án dự phòng cho ba trường hợp có thật: tem QR mờ, máy không có camera, khách từ chối
 * quyền.
 */
export function OpenTableScreen({
  repository,
  onMoPhienXong,
  dangNhapVoi = null,
  soDienThoai = null,
  onMoHoSo,
  onDangNhap,
}: OpenTableScreenProps) {
  const [qr, setQr] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [dangQuet, setDangQuet] = useState(false);

  const mo = useCallback(
    async (nhapVao: string) => {
      // Chạy qua CÙNG bộ phân tích với đường quét. Trước đây ô này gửi thẳng thứ khách gõ lên máy
      // chủ, nên dán nguyên URL trên tem QR — thứ tự nhiên nhất để dán — luôn trả QR_NOT_FOUND.
      // Hai đường vào cùng một ô, hai luật khác nhau.
      const ma = phanTichQrBan(nhapVao);
      if (ma === null) {
        setLoi('Mã không đọc được. Quét lại tem, hoặc dán đúng đường dẫn trên tem.');
        return;
      }
      const token = ma.qrToken;
      if (dangGui) return;
      setDangGui(true);
      setLoi(null);
      try {
        onMoPhienXong(await repository.moPhien(token));
      } catch (error) {
        if (!(error instanceof AuthException)) throw error;
        setLoi(error.message);
      } finally {
        setDangGui(false);
      }
    },
    [dangGui, onMoPhienXong, repository],
  );

  /**
   * Điền token vào ô nhập tay TRƯỚC khi mở phiên.
   *
   * Nếu mở phiên hỏng (bàn đã đóng, QR của quán khác), khách thấy ngay thứ vừa quét được và
   * sửa/thử lại được — thay vì một thông báo lỗi trên một ô trống.
   */
  const nhanKetQuaQuet = useCallback(
    (token: string) => {
      setDangQuet(false);
      setQr(token);
      void mo(token);
    },
    [mo],
  );

  if (dangQuet) {
    return (
      <QrScanScreen
        onHuy={() => setDangQuet(false)}
        onQuetDuoc={(ma) => nhanKetQuaQuet(ma.qrToken)}
      />
    );
  }

  const daDangNhap = dangNhapVoi !== null;

  return (
    <View style={[kieuChung.man, { padding: 24, gap: 16 }]}>
      <Text style={kieuChung.tieuDe}>Vào bàn</Text>

      {/* QUÉT là lối vào chính. Nút to, đặt trên cùng, trước cả ô nhập tay. */}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={dangGui}
        onPress={() => setDangQuet(true)}
        style={[kieuChung.nutChinh, { paddingVertical: 18 }, dangGui ? kieuChung.nutTat : null]}
      >
        <Text style={kieuChung.chuNutChinh}>Quét mã QR trên bàn</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: MauQuan.clayLine }} />
        <Text style={kieuChung.chuPhu}>hoặc nhập tay</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: MauQuan.clayLine }} />
      </View>

      <View>
        <Text style={kieuChung.nhan}>Mã QR của bàn</Text>
        <TextInput
          accessibilityLabel="Mã QR của bàn"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQr}
          onSubmitEditing={() => void mo(qr)}
          style={kieuChung.oNhap}
          value={qr}
        />
        <Text style={kieuChung.chuPhu}>
          Dán đường dẫn trên tem, hoặc mã in kèm. Dùng khi không bật được camera.
        </Text>
      </View>

      {/*
        Nói THẲNG đơn có được gắn tài khoản hay không, ngay trước khi mở bàn.

        Đây là điểm duy nhất khách còn kịp quyết định. Biết sau khi đã gọi món thì không sửa được
        nữa: phiên bàn dùng chung và người gắn trước giữ liên kết.
      */}
      {daDangNhap && soDienThoai === null && onMoHoSo !== undefined ? (
        // Đã đăng nhập nhưng CHƯA liên kết số: câu "sẽ được cộng vào tài khoản" là câu sai —
        // chưa liên kết thì điểm không cộng đi đâu cả. Nói đúng, và cho làm ngay tại chỗ, theo
        // đúng lý lẽ đã dùng cho hộp "khách vãng lai" bên dưới.
        <TouchableOpacity
          accessibilityLabel="Liên kết số điện thoại để tích điểm"
          accessibilityRole="button"
          onPress={onMoHoSo}
          style={kieuChung.the}
        >
          <Text style={kieuChung.chu}>Chưa liên kết số điện thoại</Text>
          <Text style={[kieuChung.chuPhu, { color: MauQuan.chestnut, fontWeight: '600' }]}>
            Liên kết ngay để bữa này được tích điểm
          </Text>
        </TouchableOpacity>
      ) : daDangNhap || onDangNhap === undefined ? (
        <View style={kieuChung.the}>
          <Text style={kieuChung.chu}>
            {daDangNhap
              ? 'Đơn của bàn này sẽ được cộng vào tài khoản của bạn'
              : 'Đang vào với tư cách khách vãng lai'}
          </Text>
          <Text style={kieuChung.chuPhu}>
            {daDangNhap
              ? danhTinh(dangNhapVoi.user)
              : 'Đăng nhập trước khi vào bàn nếu muốn tích điểm'}
          </Text>
        </View>
      ) : (
        // Chưa đăng nhập thì hộp này KHÔNG còn là lời thông báo — nó là việc cần làm. Để nguyên
        // dạng chữ chết là khuyên một việc rồi không cho làm.
        <TouchableOpacity
          accessibilityLabel="Đăng nhập để tích điểm"
          accessibilityRole="button"
          onPress={onDangNhap}
          style={kieuChung.the}
        >
          <Text style={kieuChung.chu}>Đang vào với tư cách khách vãng lai</Text>
          <Text style={[kieuChung.chuPhu, { color: MauQuan.chestnut, fontWeight: '600' }]}>
            Đăng nhập để tích điểm cho bữa này
          </Text>
        </TouchableOpacity>
      )}

      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

      <TouchableOpacity
        accessibilityLabel="Vào bàn"
        accessibilityRole="button"
        disabled={dangGui}
        onPress={() => void mo(qr)}
        style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
      >
        <Text style={kieuChung.chuNutChinh}>{dangGui ? 'Đang mở bàn…' : 'Vào bàn'}</Text>
      </TouchableOpacity>
    </View>
  );
}
