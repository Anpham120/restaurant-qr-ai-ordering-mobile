import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type MyLoyalty, type Reward, doiDuoc } from '../core/loyalty/loyalty';
import { type LoyaltyApi } from '../core/loyalty/loyaltyApi';
import { KhoaDatDon } from '../core/orders/khoaDatDon';
import { tienVnd } from '../core/tien';
import { TheHang } from './TheHang';
import { MauQuan, kieuChung } from './theme';

export interface LoyaltyScreenProps {
  api: LoyaltyApi;
  accessToken: string;
  onBaoTin?: ((tin: string) => void) | undefined;
  /** Hỏi xác nhận trước khi tiêu điểm. Tiêm được để test đọc được cả nhánh từ chối. */
  hoiXacNhan?: ((tieuDe: string, noiDung: string) => Promise<boolean>) | undefined;
  /**
   * Tìm mã đơn đang mở, cho ưu đãi giảm tiền.
   *
   * Hàm chứ không phải giá trị: đơn mở ra và đóng lại trong lúc màn hình này đang hiện, nên phải
   * hỏi vào ĐÚNG lúc bấm đổi. Một mã lấy sẵn từ lúc mở màn hình có thể đã thanh toán xong.
   */
  timDonDangMo?: (() => Promise<string | null>) | undefined;
}

/**
 * Điều sẽ xảy ra sau khi bấm đổi, nói bằng lời của khách.
 *
 * Tách thành hàm thuần vì đây là chỗ dễ nói sai nhất trên màn hình: cùng một nút bấm cho ra hai
 * kết quả khác hẳn nhau tuỳ bàn có đơn hay không, và khách chỉ đọc câu này một lần, ngay trước
 * khi điểm bị trừ vĩnh viễn.
 */
export function moTaViecSeXayRa(uu: Reward, maDonDangMo: string | null): string {
  if (uu.loai === 'DISCOUNT') {
    return `Giảm trực tiếp vào đơn ${maDonDangMo ?? ''} đang mở.`.replace('  ', ' ');
  }
  return maDonDangMo === null
    ? 'Bạn sẽ nhận một phiếu. Đọc số điện thoại cho nhân viên khi muốn dùng.'
    : `Món sẽ được thêm vào đơn ${maDonDangMo} và bếp làm ngay.`;
}

/**
 * Ngày đổi, dạng ngắn.
 *
 * Chuỗi backend trả về là ISO đầy đủ có múi giờ. Cắt bằng `slice` sẽ hiện giờ UTC — sai một ngày
 * với phiếu đổi sau 7 giờ tối. Một chuỗi rỗng hay hỏng thì trả về nguyên văn thay vì "Invalid
 * Date": khách đọc được cái gì đó còn hơn đọc một lỗi.
 */
function ngayNgan(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Điểm thưởng của chính tài khoản đang đăng nhập, và đổi ưu đãi (#34). */
export function LoyaltyScreen({
  api,
  accessToken,
  onBaoTin,
  hoiXacNhan = async () => true,
  timDonDangMo,
}: LoyaltyScreenProps) {
  const [diem, setDiem] = useState<MyLoyalty | null>(null);
  const [so, setSo] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [dangDoi, setDangDoi] = useState<string | null>(null);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  // Một khoá cho suốt vòng đời màn hình, gắn với ưu đãi đang đổi. Tạo mới mỗi lượt dựng là mất
  // hẳn tác dụng — và ở đây mất tác dụng nghĩa là tiêu điểm THẬT của khách hai lần.
  const khoa = useMemo(() => new KhoaDatDon(), []);

  const nap = useCallback(async () => {
    try {
      return { ok: true as const, diem: await api.cuaToi(accessToken) };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [accessToken, api]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof nap>>) => {
    if (kq.ok) {
      setDiem(kq.diem);
      setLoi(null);
    } else if ('loiNang' in kq) {
      setLoiNang(kq.loiNang);
    } else {
      setLoi(kq.loi);
    }
  }, []);

  /** Đọc lại nhưng GIỮ câu báo lỗi — cùng lý do đã ghi ở CartScreen. */
  const taiGiuLoi = useCallback(async () => {
    const kq = await nap();
    if (kq.ok) setDiem(kq.diem);
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

  const noiSo = useCallback(async () => {
    if (dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      setDiem(await api.noiSo(accessToken, so));
    } catch (e) {
      if (!(e instanceof AuthException)) {
        setLoiNang(e);
        return;
      }
      setLoi(e.message);
    } finally {
      setDangGui(false);
    }
  }, [accessToken, api, dangGui, so]);

  const doi = useCallback(
    async (uu: Reward) => {
      if (dangDoi !== null) return;

      // Hỏi mã đơn TRƯỚC hộp xác nhận, vì câu hỏi phụ thuộc vào việc bàn có đơn hay không: món
      // tặng vào thẳng đơn thì bếp làm ngay, còn không có đơn thì thành phiếu để dành. Hai chuyện
      // khác nhau với khách, nên phải nói rõ trước khi họ đồng ý trừ điểm.
      const maDonDangMo = (await timDonDangMo?.()) ?? null;

      if (uu.loai === 'DISCOUNT' && maDonDangMo === null) {
        setLoi('Chưa có đơn nào đang mở. Gọi món trước rồi dùng ưu đãi giảm tiền nhé.');
        return;
      }

      const dongY = await hoiXacNhan(
        'Đổi ưu đãi?',
        `${uu.name}\n\n${moTaViecSeXayRa(uu, maDonDangMo)}\n\nSẽ trừ ${uu.pointsRequired} điểm. Điểm đã trừ không hoàn lại.`,
      );
      if (!dongY) return;

      setDangDoi(uu.rewardId);
      setLoi(null);
      try {
        const maDon = maDonDangMo ?? undefined;
        const kq = await api.doiDiem(accessToken, uu.rewardId, khoa.khoaCho(uu.rewardId), maDon);
        khoa.quen();
        // Số dư mới đến kèm phản hồi — không gọi thêm một lượt, vì lượt đó tạo ra khoảng thời
        // gian màn hình còn hiện số dư CŨ, đúng lúc khách đang nhìn xem điểm đã trừ chưa.
        setDiem(kq.soDuMoi);
        onBaoTin?.(`Đã đổi ${kq.rewardName} · -${kq.pointsSpent} điểm`);
      } catch (e) {
        if (!(e instanceof AuthException)) {
          setLoiNang(e);
          return;
        }
        setLoi(e.message);
        // Thua tranh chấp hoặc điểm đã bị tiêu ở máy khác: đọc lại để con số trên màn hình là
        // con số thật.
        if (e.code === 'LOYALTY_NOT_ENOUGH_POINTS') await taiGiuLoi();
      } finally {
        setDangDoi(null);
      }
    },
    [accessToken, api, dangDoi, hoiXacNhan, khoa, onBaoTin, taiGiuLoi, timDonDangMo],
  );

  if (loiNang !== null) throw loiNang;

  if (diem === null && loi === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={kieuChung.tieuDe}>Điểm thưởng</Text>
      {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}

      {diem === null ? null : diem.linked ? (
        <>
          <TheHang diem={diem} />
          <Text style={kieuChung.chuPhu}>Số đã liên kết: {diem.phoneNumber}</Text>

          {/* Phiếu đã đổi đứng TRƯỚC danh mục: khách mở màn này thường là để chìa phiếu ra ở
              quầy, không phải để đổi thêm. Thứ cần dùng ngay thì không nên nằm dưới đáy. */}
          {diem.phieuChuaDung.length === 0 ? null : (
            <>
              <Text style={{ fontSize: 16, fontWeight: '700', color: MauQuan.ink, marginTop: 8 }}>
                Phiếu chưa dùng
              </Text>
              <Text style={kieuChung.chuPhu}>
                Đọc số điện thoại cho nhân viên để nhận. Phiếu biến khỏi đây khi đã nhận.
              </Text>
              {diem.phieuChuaDung.map((v) => (
                <View
                  key={v.redemptionId}
                  style={[
                    kieuChung.the,
                    { borderLeftColor: MauQuan.success, borderLeftWidth: 4, gap: 2 },
                  ]}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
                    {v.rewardName}
                  </Text>
                  <Text style={kieuChung.chuPhu}>
                    Đã đổi {ngayNgan(v.redeemedAt)} · {v.pointsSpent} điểm
                  </Text>
                </View>
              ))}
            </>
          )}

          <Text style={{ fontSize: 16, fontWeight: '700', color: MauQuan.ink, marginTop: 8 }}>
            Ưu đãi đổi được ngay
          </Text>

          {diem.availableRewards.length === 0 ? (
            <Text style={kieuChung.chu}>Chưa đủ điểm cho ưu đãi nào. Tiếp tục tích điểm nhé.</Text>
          ) : (
            diem.availableRewards.map((r) => (
              <View
                key={r.rewardId}
                style={[kieuChung.the, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
                    {r.name}
                  </Text>
                  {r.description !== null ? (
                    <Text style={kieuChung.chuPhu}>{r.description}</Text>
                  ) : null}
                  <Text style={kieuChung.chuPhu}>
                    {r.pointsRequired} điểm
                    {r.loai === 'DISCOUNT' && r.soTienGiam !== null
                      ? ' · giảm ' + tienVnd(r.soTienGiam)
                      : ''}
                  </Text>
                  {/* Nói trước điều kiện của ưu đãi giảm tiền. Để khách bấm rồi mới nhận
                      LOYALTY_ORDER_REQUIRED là bắt họ chạm vào một lời từ chối thấy trước được. */}
                  {r.loai === 'DISCOUNT' ? (
                    <Text style={kieuChung.chuPhu}>Áp vào đơn đang mở, tối đa 30% hoá đơn</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  accessibilityLabel={`Đổi ${r.name}`}
                  accessibilityRole="button"
                  disabled={dangDoi !== null || !doiDuoc(diem, r)}
                  onPress={() => void doi(r)}
                  style={[
                    kieuChung.nutChinh,
                    { paddingHorizontal: 18, paddingVertical: 10 },
                    dangDoi !== null || !doiDuoc(diem, r) ? kieuChung.nutTat : null,
                  ]}
                >
                  <Text style={kieuChung.chuNutChinh}>
                    {dangDoi === r.rewardId ? 'Đang đổi…' : 'Đổi'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </>
      ) : (
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
        </>
      )}
    </ScrollView>
  );
}
