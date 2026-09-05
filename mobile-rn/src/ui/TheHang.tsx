import { Text, View } from 'react-native';

import { type Hang, type MyLoyalty, tienDoLenHang } from '../core/loyalty/loyalty';
import { tienVnd } from '../core/tien';
import { BoGoc, MauQuan, kieuChung } from './theme';

/**
 * Màu riêng cho từng hạng.
 *
 * Không lấy màu chủ đạo của quán cho cả ba: hạng chỉ có nghĩa khi ba hạng nhìn ra khác nhau ngay
 * từ xa. Ba màu này đều đủ tối để chữ trắng đọc được trên nền.
 */
const MAU_HANG: Record<Hang, string> = {
  BAC: '#7d7d85',
  VANG: '#a47834',
  KIM_CUONG: '#4c6b8a',
};

export interface TheHangProps {
  diem: MyLoyalty;
}

/**
 * Thẻ hạng thành viên: hạng hiện tại, điểm, và còn bao xa tới hạng kế tiếp.
 *
 * Thanh tiến độ đọc `conThieu` do backend trả về chứ không tự tính từ ngưỡng: ngưỡng lên hạng là
 * luật nghiệp vụ và nó sống ở backend. Chép ngưỡng vào app sẽ tạo ra bản luật thứ hai, và bản ở
 * app là bản không ai nhớ sửa khi quán đổi chính sách.
 */
export function TheHang({ diem }: TheHangProps) {
  const mau = MAU_HANG[diem.hang];
  const tienDo = tienDoLenHang(diem);

  // Đã nối số nhưng CHƯA có hồ sơ: đừng vẽ thẻ hạng. Một thẻ "Bạc · 0 điểm" trông y hệt hội viên
  // mới, nên khách tưởng đã ghi danh xong rồi đi ăn mà quên đọc số ở quầy — và lần đó không có gì
  // được ghi. Nói thẳng việc còn phải làm thay vì vẽ một cái hạng chưa tồn tại.
  if (!diem.coHoSo) {
    return (
      <View style={[kieuChung.the, { backgroundColor: MauQuan.beige, gap: 8 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: MauQuan.ink }}>
          Chưa bắt đầu tích điểm
        </Text>
        <Text style={kieuChung.chu}>
          Số của bạn đã liên kết, nhưng chưa có lần tích điểm nào. Đọc số này ở quầy khi thanh toán
          để bắt đầu.
        </Text>
        <Text style={kieuChung.chuPhu}>Hoá đơn từ 10.000đ mới được tính điểm.</Text>
      </View>
    );
  }

  return (
    <View style={[kieuChung.the, { backgroundColor: mau, gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 12, color: MauQuan.trang, opacity: 0.85, letterSpacing: 1 }}>
            HẠNG THÀNH VIÊN
          </Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: MauQuan.trang }}>
            {diem.tenHang}
          </Text>
        </View>
        {/* Số và đơn vị vẽ thành hai dòng cho cân thẻ, nhưng trình đọc màn hình phải nghe một
            cụm: "320" rồi "điểm" tách rời là hai mẩu vô nghĩa. */}
        <View
          accessibilityLabel={`${diem.points} điểm`}
          accessible
          style={{ alignItems: 'flex-end' }}
        >
          <Text style={{ fontSize: 26, fontWeight: '700', color: MauQuan.trang }}>
            {diem.points}
          </Text>
          <Text style={{ fontSize: 12, color: MauQuan.trang, opacity: 0.85 }}>điểm</Text>
        </View>
      </View>

      <View
        accessibilityLabel={`Tiến độ lên hạng: ${Math.round(tienDo * 100)}%`}
        accessibilityRole="progressbar"
        style={{
          backgroundColor: 'rgba(255,255,255,0.28)',
          borderRadius: BoGoc.nho,
          height: 8,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            backgroundColor: MauQuan.trang,
            height: 8,
            // Phần trăm chứ không phải số điểm ảnh: thẻ này nằm trong ScrollView co giãn theo bề
            // ngang máy, và một bề rộng cố định sẽ tràn trên máy hẹp.
            width: `${tienDo * 100}%`,
          }}
        />
      </View>

      <Text style={{ fontSize: 13, color: MauQuan.trang, opacity: 0.92 }}>
        {diem.tenHangKeTiep === null
          ? 'Bạn đang ở hạng cao nhất.'
          : `Chi thêm ${tienVnd(diem.conThieu)} trong 12 tháng để lên hạng ${diem.tenHangKeTiep}.`}
      </Text>
      <Text style={{ fontSize: 12, color: MauQuan.trang, opacity: 0.75 }}>
        Đã chi {tienVnd(diem.chiTieu12Thang)} trong 12 tháng qua
      </Text>
    </View>
  );
}
