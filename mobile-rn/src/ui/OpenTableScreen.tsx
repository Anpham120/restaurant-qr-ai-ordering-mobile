import { useCallback, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type AuthSession } from '../core/auth/authSession';
import { type TableSession } from '../core/tables/tableSession';
import { type TableSessionRepository } from '../core/tables/tableSessionRepository';
import { QrScanScreen } from './QrScanScreen';
import { MauQuan, kieuChung } from './theme';

export interface OpenTableScreenProps {
  repository: TableSessionRepository;
  onMoPhienXong: (phien: TableSession) => void;
  /** Phiên đăng nhập hiện tại, chỉ dùng để nói cho khách biết đơn có được gắn tài khoản không. */
  dangNhapVoi?: AuthSession | null | undefined;
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
  onDangNhap,
}: OpenTableScreenProps) {
  const [qr, setQr] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [dangQuet, setDangQuet] = useState(false);

  const mo = useCallback(
    async (token: string) => {
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
        <Text style={kieuChung.chuPhu}>Dùng khi tem QR bị mờ hoặc không bật được camera</Text>
      </View>

      {/*
        Nói THẲNG đơn có được gắn tài khoản hay không, ngay trước khi mở bàn.

        Đây là điểm duy nhất khách còn kịp quyết định. Biết sau khi đã gọi món thì không sửa được
        nữa: phiên bàn dùng chung và người gắn trước giữ liên kết.
      */}
      {daDangNhap || onDangNhap === undefined ? (
        <View style={kieuChung.the}>
          <Text style={kieuChung.chu}>
            {daDangNhap
              ? 'Đơn của bàn này sẽ được cộng vào tài khoản của bạn'
              : 'Đang vào với tư cách khách vãng lai'}
          </Text>
          <Text style={kieuChung.chuPhu}>
            {daDangNhap ? dangNhapVoi.user.email : 'Đăng nhập trước khi vào bàn nếu muốn tích điểm'}
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
