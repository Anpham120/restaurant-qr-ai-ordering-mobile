import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { type MaQrBan, phanTichQrBan } from '../core/tables/quetQr';
import { BoGoc, MauQuan, kieuChung } from './theme';

export interface QrScanScreenProps {
  onQuetDuoc: (ma: MaQrBan) => void;
  /** Quay lại màn nhập tay — lối thoát cho mọi trường hợp camera không dùng được. */
  onHuy: () => void;
}

/**
 * Quét mã QR đặt trên bàn (§9.10).
 *
 * Đây là lối vào CHÍNH của sản phẩm: cả hệ thống tên là "gọi món qua QR". Bắt khách gõ tay chuỗi
 * `cmc-table-t01-qr` là hỏng ngay ở bước đầu — không ai đọc được chuỗi đó từ một tem dán trên bàn.
 *
 * Ô nhập tay vẫn giữ ở màn hình trước, làm phương án dự phòng cho ba trường hợp có thật: khách từ
 * chối quyền camera, máy không có camera, và tem QR bị mờ.
 *
 * <h2>Khác `mobile_scanner` của bản Flutter ở đâu</h2>
 *
 * Bản Flutter phân nhánh theo `MobileScannerErrorCode`, trong đó có `permissionDenied` và
 * `unsupported`. `expo-camera` không đưa lỗi ra kiểu đó — nó đưa **trạng thái quyền**, và trạng
 * thái đó phân biệt được thứ quan trọng hơn: **còn hỏi lại được** hay **phải vào Cài đặt**.
 *
 * Hai tình huống ấy cần hai lời khuyên khác nhau, và bản Flutter gộp chung thành một câu.
 */
export function QrScanScreen({ onQuetDuoc, onHuy }: QrScanScreenProps) {
  const [quyen, xinQuyen] = useCameraPermissions();
  const [loi, setLoi] = useState<string | null>(null);

  /**
   * Đã trả kết quả chưa. Camera bắn liên tục nhiều khung; không chốt lại thì màn hình gọi
   * `onQuetDuoc` nhiều lần và màn hình sau bị mở chồng.
   *
   * Dùng `useRef` chứ không `useState`: cờ này phải có hiệu lực NGAY trong khung tiếp theo, mà
   * `setState` chỉ áp ở lượt dựng sau — hai khung QR có thể tới trước lượt dựng đó.
   */
  const daTraKetQua = useRef(false);

  const khiQuet = useCallback(
    ({ data }: { data: string }) => {
      if (daTraKetQua.current) return;
      const kq = phanTichQrBan(data);
      if (kq !== null) {
        daTraKetQua.current = true;
        onQuetDuoc(kq);
        return;
      }
      // Quét trúng một QR KHÁC (wifi, danh thiếp, link ví). Nói rõ thay vì im lặng tiếp tục quét —
      // khách đang chĩa máy vào đúng thứ họ nghĩ là mã bàn.
      setLoi('Mã này không phải QR của bàn. Tìm tem QR dán trên mặt bàn nhé.');
    },
    [onQuetDuoc],
  );

  if (quyen === null) {
    // Đang hỏi hệ điều hành. Khung đen im lặng ở đây khiến khách tưởng máy treo.
    return (
      <ManToi>
        <Text style={{ color: MauQuan.trang }}>Đang mở camera…</Text>
      </ManToi>
    );
  }

  if (!quyen.granted) {
    // Hai câu khác nhau cho hai tình huống khác nhau. Bảo khách "vào Cài đặt" khi hệ điều hành
    // vẫn còn cho hỏi lại là bắt họ đi đường vòng; ngược lại, hiện nút "Cho phép" khi hệ điều
    // hành đã khoá hẳn là hứa một việc bấm vào không xảy ra gì.
    return (
      <ManToi>
        <Text style={{ color: MauQuan.trang, textAlign: 'center' }}>
          {quyen.canAskAgain
            ? 'Ứng dụng cần quyền camera để quét mã QR trên bàn.'
            : 'Quyền camera đang bị chặn.\nMở Cài đặt → Ứng dụng → Camera, hoặc nhập mã bằng tay.'}
        </Text>
        {quyen.canAskAgain ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void xinQuyen()}
            style={kieuChung.nutChinh}
          >
            <Text style={kieuChung.chuNutChinh}>Cho phép dùng camera</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity accessibilityRole="button" onPress={onHuy} style={kieuChung.nutVien}>
          <Text style={{ color: MauQuan.trang, fontSize: 16, fontWeight: '600' }}>
            Quay lại nhập mã bằng tay
          </Text>
        </TouchableOpacity>
      </ManToi>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        // Chỉ đọc QR. Bật cả mã vạch khiến camera nhận nhầm tem giá dán cạnh bàn.
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={khiQuet}
        style={{ flex: 1 }}
        testID="camera-quet-qr"
      />

      {/* Khung ngắm: nói cho khách biết chĩa vào đâu. */}
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 240,
              height: 240,
              borderWidth: 3,
              borderColor: MauQuan.brass,
              borderRadius: BoGoc.the,
            }}
          />
        </View>
      </View>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: 48, gap: 12 }}>
        {loi !== null ? (
          <View style={{ backgroundColor: MauQuan.danger, borderRadius: BoGoc.vua, padding: 12 }}>
            <Text style={{ color: MauQuan.trang, textAlign: 'center' }}>{loi}</Text>
          </View>
        ) : null}
        <Text style={{ color: '#ffffffb3', textAlign: 'center' }}>
          Đưa mã QR trên bàn vào khung
        </Text>
        <TouchableOpacity accessibilityRole="button" onPress={onHuy} style={kieuChung.nutVien}>
          <Text style={{ color: MauQuan.trang, fontSize: 16, fontWeight: '600' }}>
            Nhập mã bằng tay
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ManToi({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 20,
      }}
    >
      {children}
    </View>
  );
}
