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
import { MauQuan, kieuChung } from './theme';

export interface LoyaltyScreenProps {
  api: LoyaltyApi;
  accessToken: string;
  onBaoTin?: (tin: string) => void;
  /** Hỏi xác nhận trước khi tiêu điểm. Tiêm được để test đọc được cả nhánh từ chối. */
  hoiXacNhan?: (tieuDe: string, noiDung: string) => Promise<boolean>;
}

/** Điểm thưởng của chính tài khoản đang đăng nhập, và đổi ưu đãi (#34). */
export function LoyaltyScreen({
  api,
  accessToken,
  onBaoTin,
  hoiXacNhan = async () => true,
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
      const dongY = await hoiXacNhan(
        'Đổi ưu đãi?',
        `${uu.name}\n\nSẽ trừ ${uu.pointsRequired} điểm. Điểm đã trừ không hoàn lại.`,
      );
      if (!dongY) return;

      setDangDoi(uu.rewardId);
      setLoi(null);
      try {
        const kq = await api.doiDiem(accessToken, uu.rewardId, khoa.khoaCho(uu.rewardId));
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
    [accessToken, api, dangDoi, hoiXacNhan, khoa, onBaoTin, taiGiuLoi],
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
          <View style={kieuChung.the}>
            <Text style={{ fontSize: 24, fontWeight: '700', color: MauQuan.chestnut }}>
              {diem.points} điểm
            </Text>
            <Text style={kieuChung.chuPhu}>Số đã liên kết: {diem.phoneNumber}</Text>
          </View>

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
                  <Text style={kieuChung.chuPhu}>{r.pointsRequired} điểm</Text>
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
