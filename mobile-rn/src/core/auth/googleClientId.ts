/**
 * Web client ID của dự án Google Cloud.
 *
 * KHÔNG phải bí mật. Client ID nằm sẵn trong gói cài của mọi ứng dụng dùng Google Sign-In — ai
 * cũng moi ra được, và Google thiết kế nó như vậy. Phần bí mật là client *secret*, và luồng đăng
 * nhập trên di động không dùng tới. Nên để trong mã nguồn ở đây là đúng chỗ, không vi phạm luật
 * "bí mật chỉ đi qua biến môi trường" của dự án.
 *
 * Vì sao đặt trong mã thay vì màn hình cài đặt như `apiBaseUrl`: địa chỉ máy chủ đổi theo từng
 * mạng nên khách/người kiểm phải sửa được lúc chạy; client ID thì gắn với dự án Google Cloud và
 * với chữ ký của bản dựng, một bản dựng chỉ dùng được đúng một giá trị.
 *
 * Để RỖNG cho tới khi có ID thật. Rỗng thì `taoLayTokenGoogle` trả `undefined` và `LoginScreen`
 * không hiện nút Google — đúng hơn hẳn việc hiện một nút bấm vào chỉ để nhận lỗi cấu hình.
 *
 * Lấy ở đâu: Google Cloud Console → APIs & Services → Credentials → OAuth client ID loại
 * **Web application**. Đúng, loại Web, kể cả khi app chạy trên Android — thư viện dùng web client
 * ID để xin `idToken`, còn Android client ID chỉ cần tồn tại (kèm SHA-1) chứ không điền vào đây.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '1015049127458-o8ncqiln5blaei9ume0mahiq66063uvp.apps.googleusercontent.com';
