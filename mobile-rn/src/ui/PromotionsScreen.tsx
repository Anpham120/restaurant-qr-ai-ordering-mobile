import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { AuthException } from '../core/auth/authApi';
import { type Promotion, moTaDieuKien, moTaMucGiam } from '../core/promotions/promotion';
import { type PromotionApi } from '../core/promotions/promotionApi';
import { BoGoc, MauQuan, kieuChung } from './theme';

export interface PromotionsScreenProps {
  api: PromotionApi;
}

/** Khuyến mãi đang chạy (§9.10 M1 mục 3) — xem được cả khi chưa đăng nhập, chưa vào bàn. */
export function PromotionsScreen({ api }: PromotionsScreenProps) {
  const [ds, setDs] = useState<readonly Promotion[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [loiNang, setLoiNang] = useState<unknown>(null);

  const nap = useCallback(async () => {
    try {
      return { ok: true as const, ds: await api.dangChay() };
    } catch (e) {
      if (!(e instanceof AuthException)) return { ok: false as const, loiNang: e };
      return { ok: false as const, loi: e.message };
    }
  }, [api]);

  const apDung = useCallback((kq: Awaited<ReturnType<typeof nap>>) => {
    if (kq.ok) {
      setDs(kq.ds);
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

  useEffect(() => {
    let huy = false;
    void nap().then((kq) => {
      if (!huy) apDung(kq);
    });
    return () => {
      huy = true;
    };
  }, [apDung, nap]);

  if (loiNang !== null) throw loiNang;

  if (loi !== null) {
    return (
      <View style={[kieuChung.man, { padding: 24, gap: 12 }]}>
        <Text style={{ color: MauQuan.danger }}>{loi}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void tai()}
          style={kieuChung.nutVien}
        >
          <Text style={kieuChung.chuNutVien}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (ds === null) {
    return (
      <View style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </View>
    );
  }

  return (
    <ScrollView style={kieuChung.man} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={kieuChung.tieuDe}>Khuyến mãi</Text>
      {ds.length === 0 ? (
        <Text style={[kieuChung.chuPhu, { padding: 32, textAlign: 'center' }]}>
          Hiện chưa có khuyến mãi nào đang chạy.
        </Text>
      ) : (
        ds.map((p) => {
          const dieuKien = moTaDieuKien(p);
          return (
            <View key={p.code} style={[kieuChung.the, { gap: 4 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: MauQuan.ink }}>
                  {p.name}
                </Text>
                {p.isFlashSale ? (
                  <View
                    style={{
                      backgroundColor: MauQuan.danger,
                      borderRadius: BoGoc.nho,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ color: MauQuan.trang, fontSize: 11 }}>FLASH</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: 15, fontWeight: '700', color: MauQuan.brass }}>
                  {p.code}
                </Text>
              </View>
              <Text style={kieuChung.chu}>{moTaMucGiam(p)}</Text>
              {/*
                Hiện điều kiện tối thiểu dù giỏ chưa đủ tiền. Backend cố ý vẫn trả mã trong tình
                huống đó, và giấu ngưỡng đi là giấu đúng thông tin khách cần để quyết định gọi
                thêm món.
              */}
              {dieuKien !== null ? <Text style={kieuChung.chuPhu}>{dieuKien}</Text> : null}
              {p.description !== null && p.description.length > 0 ? (
                <Text style={kieuChung.chuPhu}>{p.description}</Text>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
