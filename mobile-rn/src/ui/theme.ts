import { StyleSheet } from 'react-native';

/**
 * Bảng màu lấy NGUYÊN VĂN từ web, không tự chọn lại.
 *
 * App di động và web đặt món là hai cửa vào cùng một quán. Khách quét QR ở bàn rồi mở app phải
 * thấy cùng một nơi, không phải hai sản phẩm khác nhau — nên màu ở đây chép đúng biến CSS của
 * `frontend/src/components/customer/customer-menu.css` (chủ đề "Vị An").
 */
export const MauQuan = {
  chestnut: '#6f3d2c',
  chestnutDark: '#4c291f',
  brass: '#a47834',
  ivory: '#fffaf5',
  ink: '#2f1d16',
  muted: '#80685e',
  clayLine: '#ead8cd',
  success: '#2f7251',
  danger: '#b13c32',
  cardBg: '#f1dfd3',
  beige: '#f8eee5',
  trang: '#ffffff',
} as const;

/** Bo góc lấy từ `--radius-*` của web: thẻ món web dùng 20px. */
export const BoGoc = { nho: 8, vua: 12, lon: 16, the: 20 } as const;

/**
 * Kiểu dùng chung thay cho `ThemeData` của Flutter.
 *
 * React Native không có tầng chủ đề áp xuống mọi widget, nên thứ thay thế phải là một bộ kiểu
 * được các màn hình dùng lại. Ghi ra đây thay vì để mỗi màn hình tự đặt màu: nhân bản màu là cách
 * chắc chắn để hai màn hình lệch nhau vài sắc độ mà không ai nhận ra cho tới lúc chụp màn hình.
 *
 * KHÔNG kèm tệp font. "Be Vietnam Pro" của web sẽ làm bản dựng nặng thêm cho mỗi độ đậm, và font
 * hệ thống hiển thị tiếng Việt có dấu đầy đủ. Ghi ra để đây là một lựa chọn, không phải thiếu sót.
 */
export const kieuChung = StyleSheet.create({
  man: { flex: 1, backgroundColor: MauQuan.ivory },
  than: { padding: 20, gap: 16 },
  tieuDe: { fontSize: 22, fontWeight: '600', color: MauQuan.ink },
  chu: { fontSize: 15, color: MauQuan.ink, lineHeight: 22 },
  chuPhu: { fontSize: 13, color: MauQuan.muted, lineHeight: 19 },
  nhan: { fontSize: 13, fontWeight: '500', color: MauQuan.muted, marginBottom: 6 },
  oNhap: {
    backgroundColor: MauQuan.trang,
    borderWidth: 1,
    borderColor: MauQuan.clayLine,
    borderRadius: BoGoc.vua,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: MauQuan.ink,
  },
  nutChinh: {
    backgroundColor: MauQuan.chestnut,
    borderRadius: BoGoc.vua,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  chuNutChinh: { color: MauQuan.trang, fontSize: 16, fontWeight: '600' },
  nutVien: {
    borderWidth: 1,
    borderColor: MauQuan.clayLine,
    borderRadius: BoGoc.vua,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  chuNutVien: { color: MauQuan.chestnut, fontSize: 16, fontWeight: '600' },
  nutTat: { opacity: 0.5 },
  the: {
    backgroundColor: MauQuan.trang,
    borderWidth: 1,
    borderColor: MauQuan.clayLine,
    borderRadius: BoGoc.the,
    padding: 16,
  },
});
