import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, Text, View } from 'react-native';

import { type CauHinhMayChu } from './src/core/cauHinh/cauHinh';
import { CauHinhStore } from './src/core/cauHinh/cauHinhStore';
import { ServerSettingsScreen } from './src/ui/ServerSettingsScreen';
import { MauQuan, kieuChung } from './src/ui/theme';

const store = new CauHinhStore();

/**
 * Bản chuyển sang React Native đang dựng dần (#145).
 *
 * Hiện mới có tầng nền: cấu hình máy chủ, kho lưu an toàn, phiên đăng nhập, giao diện thương
 * hiệu. Các màn hình còn lại theo sau trong những PR sau, mỗi PR mang theo test của phần đó.
 *
 * App vẫn mở thẳng vào màn hình máy chủ vì đó là bước đầu tiên thật sự của người dùng: chưa có
 * địa chỉ thì không màn hình nào khác gọi được gì.
 */
export default function App() {
  const [cauHinh, setCauHinh] = useState<CauHinhMayChu | null>(null);
  const [dangDoc, setDangDoc] = useState(true);

  useEffect(() => {
    store
      .doc()
      .then(setCauHinh)
      .finally(() => setDangDoc(false));
  }, []);

  const luu = useCallback(async (moi: CauHinhMayChu) => {
    await store.luu(moi);
    setCauHinh(moi);
  }, []);

  if (dangDoc) {
    return (
      <SafeAreaView style={[kieuChung.man, { justifyContent: 'center' }]}>
        <ActivityIndicator color={MauQuan.chestnut} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={kieuChung.man}>
      <StatusBar style="dark" />
      <ServerSettingsScreen
        batBuoc={cauHinh === null}
        hienTai={cauHinh ?? { apiBaseUrl: '', imageBaseUrl: '' }}
        onLuu={luu}
      />
      {cauHinh !== null ? (
        <View style={{ padding: 20 }}>
          <Text style={kieuChung.chuPhu}>
            Đã lưu máy chủ. Các màn hình còn lại đang được chuyển sang React Native.
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
