import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AuthException } from '../core/auth/authApi';
import {
  type ChatMessage,
  type GoiYThemMon,
  GIOI_HAN_DO_DAI_CAU_HOI,
  cauHoiGuiDuoc,
  cuaKhach,
} from '../core/chat/chat';
import { type ChatApi } from '../core/chat/chatApi';
import { type TableSession } from '../core/tables/tableSession';
import { tienVnd } from '../core/tien';
import { BoGoc, MauQuan, kieuChung } from './theme';

export interface ChatScreenProps {
  api: ChatApi;
  phienBan: TableSession;
  /** Thêm món vào giỏ. Chỉ chạy khi KHÁCH bấm — xem ghi chú ở khối gợi ý. */
  // `| undefined` bắt buộc dưới `exactOptionalPropertyTypes`: nơi gọi truyền thẳng một biến
  // có thể undefined vào prop chỉ khai `?` là lỗi kiểu.
  onThemVaoGio?: ((menuItemId: string, quantity: number) => Promise<void>) | undefined;
  onBaoTin?: ((tin: string) => void) | undefined;
}

/** Trợ lý gọi món (§9.10 M2 mục 7). */
export function ChatScreen({ api, phienBan, onThemVaoGio, onBaoTin }: ChatScreenProps) {
  const [phienId, setPhienId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [tin, setTin] = useState<readonly ChatMessage[]>([]);
  const [goiY, setGoiY] = useState<readonly GoiYThemMon[]>([]);
  const [canGoiNhanVien, setCanGoiNhanVien] = useState(false);
  const [oNhap, setONhap] = useState('');
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  const nap = useCallback(async () => {
    try {
      return {
        ok: true as const,
        phien: await api.moPhien(phienBan.sessionId, phienBan.tableCode),
      };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [api, phienBan]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof nap>>) => {
    if (kq.ok) {
      setPhienId(kq.phien.chatSessionId);
      setToken(kq.phien.accessToken);
      // Phiên dùng lại thì lịch sử đã có sẵn — KHÔNG xoá màn hình rồi chào lại từ đầu. Khách quay
      // lại giữa cuộc trò chuyện của chính mình.
      setTin(kq.phien.messages);
      setLoi(null);
    } else if ('loiNang' in kq) {
      setLoiNang(kq.loiNang);
    } else {
      setLoi(kq.loi);
    }
  }, []);

  useEffect(() => {
    let huy = false;
    void nap().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, nap]);

  const gui = useCallback(async () => {
    if (dangGui || phienId === null || !cauHoiGuiDuoc(oNhap)) return;
    const cauHoi = oNhap.trim();
    setDangGui(true);
    setLoi(null);
    setGoiY([]);
    setCanGoiNhanVien(false);
    try {
      const luot = await api.gui(phienId, token, cauHoi);
      // Dùng tin nhắn khách do BACKEND trả, không dựng bản của app: id và thời điểm do máy chủ
      // quyết định.
      setTin((truoc) => [...truoc, luot.tinKhach, luot.traLoi]);
      setGoiY(luot.goiY);
      setCanGoiNhanVien(luot.canGoiNhanVien);
      setONhap('');
    } catch (e) {
      if (!(e instanceof AuthException)) {
        setLoiNang(e);
        return;
      }
      setLoi(e.message);
    } finally {
      setDangGui(false);
    }
  }, [api, dangGui, oNhap, phienId, token]);

  const them = useCallback(
    async (g: GoiYThemMon) => {
      if (onThemVaoGio === undefined) return;
      try {
        await onThemVaoGio(g.menuItemId, g.quantity);
        onBaoTin?.(`Đã thêm ${g.name} vào giỏ`);
      } catch (e) {
        if (!(e instanceof AuthException)) throw e;
        onBaoTin?.(e.message);
      }
    },
    [onBaoTin, onThemVaoGio],
  );

  if (loiNang !== null) throw loiNang;

  if (phienId === null && loi === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <View style={kieuChung.man}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={kieuChung.tieuDe}>Trợ lý</Text>

        {tin.map((m, vt) => (
          <View
            key={m.id.length > 0 ? m.id : `tin-${vt}`}
            style={{
              alignSelf: cuaKhach(m) ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              backgroundColor: cuaKhach(m) ? MauQuan.beige : MauQuan.trang,
              borderWidth: 1,
              borderColor: MauQuan.clayLine,
              borderRadius: BoGoc.vua,
              padding: 12,
            }}
          >
            <Text selectable style={kieuChung.chu}>
              {m.content}
            </Text>
          </View>
        ))}

        {dangGui ? <Text style={kieuChung.chuPhu}>Trợ lý đang xem thực đơn…</Text> : null}

        {goiY.length > 0 ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: MauQuan.ink }}>
              Trợ lý gợi ý
            </Text>
            {/*
              Câu này KHÔNG phải cho đẹp. Backend chỉ chuyển tiếp gợi ý có
              `requiresCustomerConfirmation == true`, nên mọi gợi ý tới đây đều là "hỏi khách".
              App tuyệt đối không tự thêm: đó là tiêu tiền của khách theo lời một mô hình ngôn ngữ.
            */}
            <Text style={kieuChung.chuPhu}>Bấm để thêm vào giỏ — trợ lý không tự thêm gì cả.</Text>
            {goiY.map((g) => (
              <View
                key={g.menuItemId}
                style={[kieuChung.the, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: MauQuan.ink }}>
                    {g.quantity} x {g.name}
                  </Text>
                  {/* Hiện LÝ DO để khách tự đánh giá thay vì tin thẳng. */}
                  {g.reason !== null ? <Text style={kieuChung.chuPhu}>{g.reason}</Text> : null}
                  <Text style={kieuChung.chuPhu}>{tienVnd(g.price)}</Text>
                </View>
                {onThemVaoGio !== undefined ? (
                  <TouchableOpacity
                    accessibilityLabel={`Thêm ${g.name}`}
                    accessibilityRole="button"
                    onPress={() => void them(g)}
                    style={[kieuChung.nutChinh, { paddingHorizontal: 18, paddingVertical: 10 }]}
                  >
                    <Text style={kieuChung.chuNutChinh}>Thêm</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {canGoiNhanVien ? (
          <Text style={kieuChung.chuPhu}>Câu này nên hỏi nhân viên trực tiếp sẽ nhanh hơn.</Text>
        ) : null}

        {loi !== null ? <Text style={{ color: MauQuan.danger }}>{loi}</Text> : null}
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: MauQuan.clayLine,
          backgroundColor: MauQuan.trang,
        }}
      >
        <TextInput
          accessibilityLabel="Câu hỏi"
          maxLength={GIOI_HAN_DO_DAI_CAU_HOI}
          multiline
          onChangeText={setONhap}
          placeholder="Hỏi trợ lý về món ăn…"
          style={[kieuChung.oNhap, { flex: 1, maxHeight: 100 }]}
          value={oNhap}
        />
        <TouchableOpacity
          accessibilityLabel="Gửi"
          accessibilityRole="button"
          // Khoá khi câu hỏi rỗng: backend trả CHAT_MESSAGE_EMPTY, và một lượt hỏng VẪN tính vào
          // hạn mức 10 tin/phút — tức bấm nhầm làm khách mất lượt hỏi thật.
          disabled={dangGui || !cauHoiGuiDuoc(oNhap)}
          onPress={() => void gui()}
          style={[
            kieuChung.nutChinh,
            { paddingHorizontal: 18 },
            dangGui || !cauHoiGuiDuoc(oNhap) ? kieuChung.nutTat : null,
          ]}
        >
          <Text style={kieuChung.chuNutChinh}>Gửi</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
