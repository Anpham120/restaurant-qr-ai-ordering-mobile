/**
 * Cấu hình Expo, đọc thêm từ biến môi trường.
 *
 * <p>Toàn bộ phần tĩnh vẫn nằm ở `app.json`; tệp này CHỈ chèn những thứ không được nằm trong kho.
 * Expo đọc `app.json` trước rồi truyền vào đây qua `config`, nên không có gì bị nhân đôi.
 *
 * <p><b>Vì sao cần.</b> `google-services.json` bị `.gitignore` chặn (dòng 47), nên EAS không gửi
 * nó lên máy dựng — bản dựng đầu tiên báo đúng điều đó:
 *
 *     File specified via "android.googleServicesFile" field in your app.json is not checked in
 *     to your repository and won't be uploaded to the builder.
 *
 * Hệ quả im lặng: APK dựng ra vẫn cài và chạy được, nhưng KHÔNG có cấu hình Firebase — đăng ký
 * bằng OTP và đăng nhập Google hỏng, trong khi mọi thứ khác trông vẫn bình thường.
 *
 * <p><b>Vì sao không chỉ việc bỏ dòng .gitignore đó.</b> Kho này CÔNG KHAI. Tệp không chứa client
 * secret, nhưng có khoá API Firebase, và đưa khoá lên kho công khai là trái luật đã đặt cho dự án:
 * bí mật chỉ đi qua biến môi trường. Khác với `GOOGLE_WEB_CLIENT_ID` — thứ Google thiết kế để công
 * khai và đã nằm sẵn trong mã.
 *
 * <p>Lúc dựng ở EAS, `GOOGLE_SERVICES_JSON` là ĐƯỜNG DẪN tới tệp mà EAS đặt sẵn. Ở máy cá nhân
 * biến đó trống và ta dùng tệp nằm cạnh — nên `npx expo run:android` vẫn chạy như cũ.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
