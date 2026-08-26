import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { KhoaDatDon } from '../core/orders/khoaDatDon';
import { type Invoice, huongDanChoXacNhan, nhanTrangThaiHoaDon } from '../core/payment/invoice';
import { type InvoiceApi } from '../core/payment/invoiceApi';
import { type Promotion } from '../core/promotions/promotion';
import { type PromotionApi } from '../core/promotions/promotionApi';
import { type TableSession } from '../core/tables/tableSession';
import { tienVnd } from '../core/tien';
import { MauQuan, kieuChung } from './theme';

export interface PaymentScreenProps {
  api: InvoiceApi;
  /**
   * Để liệt kê mã đang chạy ngay cạnh ô nhập.
   *
   * Không có nó thì khách chỉ gõ được mã họ đã biết từ nơi khác — tờ rơi, biển trong quán. Bản
   * thân hệ thống không cho họ biết mã nào đang có, dù backend vẫn trả lời được câu đó.
   */
  promotionApi?: PromotionApi | undefined;
  phienBan: TableSession;
  soDienThoai?: string | null | undefined;
  /** Báo tin ra ngoài (đã chép nội dung…). Tách khỏi màn để test đọc được. */
  onBaoTin?: ((tin: string) => void) | undefined;
  /** Tiêm được để test không phụ thuộc clipboard của nền tảng. */
  chepVaoBoNho?: ((chuoi: string) => Promise<void>) | undefined;
}

/**
 * Hoá đơn bàn và yêu cầu thanh toán (§9.10 M2 mục 6).
 *
 * Màn hình này CỐ Ý không có nút "Tôi đã trả". Khách không có quyền xác nhận — đo thật:
 * `POST .../invoice/payment/confirm` bằng token bàn trả **401**, endpoint đó chỉ dành cho nhân
 * viên quầy. Một nút không làm gì sẽ khiến khách bấm rồi tưởng đã xong và bỏ đi.
 */
export function PaymentScreen({
  api,
  phienBan,
  soDienThoai = null,
  promotionApi,
  onBaoTin,
  chepVaoBoNho = (s) => Clipboard.setStringAsync(s).then(() => undefined),
}: PaymentScreenProps) {
  const [hd, setHd] = useState<Invoice | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  const khoa = useMemo(() => new KhoaDatDon(), []);

  const nap = useCallback(async () => {
    try {
      return {
        ok: true as const,
        hd: await api.hoaDon(phienBan.sessionId, phienBan.tableSessionToken),
      };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [api, phienBan]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof nap>>) => {
    if (kq.ok) {
      setHd(kq.hd);
      setLoi(null);
    } else if ('loiNang' in kq) {
      setLoiNang(kq.loiNang);
    } else {
      setLoi(kq.loi);
    }
  }, []);

  const tai = useCallback(async () => {
    apDung(await nap());
  }, [apDung, nap]);

  /** Đọc lại nhưng GIỮ câu báo lỗi — cùng lý do đã ghi ở CartScreen. */
  const taiGiuLoi = useCallback(async () => {
    const kq = await nap();
    if (kq.ok) setHd(kq.hd);
    else if ('loiNang' in kq) setLoiNang(kq.loiNang);
  }, [nap]);

  useEffect(() => {
    let huy = false;
    void nap().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, nap]);

  const [maKhuyenMai, setMaKhuyenMai] = useState('');
  const [maDoiDiem, setMaDoiDiem] = useState('');
  const [maDangChay, setMaDangChay] = useState<readonly Promotion[]>([]);

  useEffect(() => {
    if (promotionApi === undefined) return;
    let huy = false;
    void promotionApi
      .dangChay()
      .then((ds) => {
        if (!huy) setMaDangChay(ds);
      })
      // Không có mã nào cũng không sao, và lỗi mạng ở đây không được chặn việc trả tiền.
      .catch(() => undefined);
    return () => {
      huy = true;
    };
  }, [promotionApi]);

  const yeuCau = useCallback(
    async (method: string) => {
      if (dangGui) return;
      setDangGui(true);
      setLoi(null);
      try {
        setHd(
          await api.yeuCauThanhToan(
            phienBan.sessionId,
            phienBan.tableSessionToken,
            method,
            // Khoá gắn với PHƯƠNG THỨC: gửi lại cùng cách trả tiền là cùng một yêu cầu; đổi từ
            // COD sang VietQR là yêu cầu khác và phải có khoá khác.
            khoa.khoaCho(method),
            soDienThoai,
            maKhuyenMai,
            maDoiDiem,
          ),
        );
      } catch (e) {
        if (!(e instanceof AuthException)) {
          setLoiNang(e);
          return;
        }
        setLoi(e.message);
        // Bàn đã có yêu cầu rồi: đọc lại để hiện đúng thứ đang chờ, thay vì để khách bấm tiếp.
        if (e.code === 'TABLE_INVOICE_PAYMENT_PENDING') await taiGiuLoi();
      } finally {
        setDangGui(false);
      }
    },
    [api, dangGui, khoa, phienBan, soDienThoai, taiGiuLoi, maKhuyenMai, maDoiDiem],
  );

  if (loiNang !== null) throw loiNang;

  if (hd === null && loi === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={kieuChung.tieuDe}>Thanh toán</Text>
      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

      {hd === null ? null : hd.items.length === 0 ? (
        <Text style={[kieuChung.chuPhu, { padding: 24, textAlign: 'center' }]}>
          Bàn chưa có món nào để thanh toán.
        </Text>
      ) : (
        <>
          <Text style={kieuChung.chuPhu}>{hd.invoiceCode}</Text>
          {hd.items.map((i, vt) => (
            <View key={`${i.name}-${vt}`} style={{ flexDirection: 'row' }}>
              <Text style={[kieuChung.chu, { flex: 1 }]}>
                {i.quantity} x {i.name}
              </Text>
              <Text style={kieuChung.chu}>{tienVnd(i.lineTotal)}</Text>
            </View>
          ))}

          <View style={{ height: 1, backgroundColor: MauQuan.clayLine, marginVertical: 8 }} />

          {hd.discountAmount > 0 ? (
            <View style={{ flexDirection: 'row' }}>
              <Text style={[kieuChung.chu, { flex: 1 }]}>Giảm giá</Text>
              <Text style={kieuChung.chu}>-{tienVnd(hd.discountAmount)}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row' }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: MauQuan.ink }}>
              Tổng
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: MauQuan.chestnut }}>
              {tienVnd(hd.totalAmount)}
            </Text>
          </View>

          <Text style={kieuChung.chu}>{nhanTrangThaiHoaDon(hd.status)}</Text>

          {hd.status === 'NotRequested' ? (
            <View style={{ gap: 8, marginTop: 12 }}>
              {soDienThoai !== null ? (
                <Text style={kieuChung.chuPhu}>Tích điểm cho {soDienThoai}</Text>
              ) : null}
              {/*
                Nói TRƯỚC rằng thêm món sẽ bị khoá. Đo thật: sau khi yêu cầu, thêm món trả
                TABLE_INVOICE_PAYMENT_PENDING — nhưng BỚT món vẫn được, nên không nói "khoá giỏ".
              */}
              <Text style={kieuChung.chu}>
                Sau khi yêu cầu, bàn không gọi thêm món được nữa (vẫn bớt được món đã chọn).
              </Text>

              {/*
                Hai ô mã đứng cạnh nhau vì với khách chúng là CÙNG một loại vật: một mã, gõ vào,
                được giảm tiền. Khác nhau ở nguồn gốc — mã của quán ai cũng dùng, mã đổi điểm là
                thứ khách đã mua bằng điểm. Cả hai cộng dồn, và trần tổng do máy chủ cắt.
              */}
              <View>
                <Text style={kieuChung.nhan}>Mã ưu đãi của quán</Text>
                <TextInput
                  accessibilityLabel="Mã ưu đãi của quán"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={setMaKhuyenMai}
                  placeholder="Ví dụ: GIAM10"
                  style={kieuChung.oNhap}
                  value={maKhuyenMai}
                />
              </View>

              {/*
                Chạm là điền. Trước đây tab Khuyến mãi liệt kê mã còn màn này không có ô nào —
                khách thấy ưu đãi, chép mã, rồi không có chỗ dán. Bắt gõ lại một mã đang hiện ngay
                trên màn hình là bắt làm một việc máy làm được.
              */}
              {maDangChay.length === 0 ? null : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {maDangChay.map((km) => (
                    <TouchableOpacity
                      accessibilityLabel={`Dùng mã ${km.code}`}
                      accessibilityRole="button"
                      key={km.code}
                      onPress={() => setMaKhuyenMai(km.code)}
                      style={[kieuChung.nutVien, { paddingHorizontal: 14, paddingVertical: 8 }]}
                    >
                      <Text style={kieuChung.chuNutVien}>{km.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View>
                <Text style={kieuChung.nhan}>Mã đổi bằng điểm</Text>
                <TextInput
                  accessibilityLabel="Mã đổi bằng điểm"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={setMaDoiDiem}
                  placeholder="Mã bạn đổi ở mục Điểm thưởng"
                  style={kieuChung.oNhap}
                  value={maDoiDiem}
                />
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={dangGui}
                onPress={() => void yeuCau('COD')}
                style={[kieuChung.nutChinh, dangGui ? kieuChung.nutTat : null]}
              >
                <Text style={kieuChung.chuNutChinh}>Trả tiền mặt tại quầy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={dangGui}
                onPress={() => void yeuCau('VietQR')}
                style={[kieuChung.nutVien, dangGui ? kieuChung.nutTat : null]}
              >
                <Text style={kieuChung.chuNutVien}>Chuyển khoản VietQR</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {hd.status === 'Pending' ? (
            <DangCho
              chepVaoBoNho={chepVaoBoNho}
              hoaDon={hd}
              onBaoTin={onBaoTin}
              onKiemTraLai={() => void tai()}
            />
          ) : null}

          {hd.status === 'Paid' ? (
            <Text style={[kieuChung.chu, { textAlign: 'center', marginTop: 12 }]}>
              Cảm ơn bạn. Hẹn gặp lại!
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

interface DangChoProps {
  hoaDon: Invoice;
  onKiemTraLai: () => void;
  onBaoTin?: ((tin: string) => void) | undefined;
  chepVaoBoNho: (chuoi: string) => Promise<void>;
}

function DangCho({ hoaDon: hd, onKiemTraLai, onBaoTin, chepVaoBoNho }: DangChoProps) {
  const [anhHong, setAnhHong] = useState(false);
  const qr = hd.vietQr;
  const coAnh = qr?.qrImageDataUri?.startsWith('data:image') === true;

  const chep = useCallback(async () => {
    if (qr === null) return;
    await chepVaoBoNho(qr.transferContent);
    onBaoTin?.('Đã chép nội dung');
  }, [chepVaoBoNho, onBaoTin, qr]);

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
      <Text style={kieuChung.chu}>{huongDanChoXacNhan(hd.method)}</Text>

      {qr !== null ? (
        <>
          {coAnh && !anhHong ? (
            <Image
              accessibilityLabel="Mã QR chuyển khoản"
              onError={() => setAnhHong(true)}
              source={{ uri: qr.qrImageDataUri ?? '' }}
              style={{ width: 220, height: 220, alignSelf: 'center' }}
            />
          ) : null}

          {/*
            Ảnh QR hỏng KHÔNG được che mất nội dung chuyển khoản bên dưới — khách vẫn chuyển tay
            được nếu còn đọc được nội dung. Nên phần này nằm NGOÀI nhánh có ảnh.
          */}
          <View style={kieuChung.the}>
            <Text style={kieuChung.nhan}>Nội dung chuyển khoản</Text>
            <Text accessibilityLabel="Nội dung chuyển khoản" selectable style={kieuChung.chu}>
              {qr.transferContent}
            </Text>
            {/*
              Cho CHÉP chứ không cho sửa: hệ thống đối soát bằng đúng chuỗi này (#3), sửa một ký
              tự là tiền về mà không ai nhận ra.
            */}
            <TouchableOpacity
              accessibilityLabel="Chép nội dung chuyển khoản"
              accessibilityRole="button"
              onPress={() => void chep()}
              style={[kieuChung.nutVien, { marginTop: 8 }]}
            >
              <Text style={kieuChung.chuNutVien}>Chép nội dung</Text>
            </TouchableOpacity>
          </View>

          <View style={kieuChung.the}>
            <Text style={kieuChung.nhan}>Số tiền</Text>
            <Text selectable style={kieuChung.chu}>
              {tienVnd(qr.amount)}
            </Text>
          </View>
        </>
      ) : null}

      <TouchableOpacity accessibilityRole="button" onPress={onKiemTraLai} style={kieuChung.nutVien}>
        <Text style={kieuChung.chuNutVien}>Kiểm tra lại trạng thái</Text>
      </TouchableOpacity>
    </View>
  );
}
