/**
 * Giữ khoá `Idempotency-Key` cho một lần đặt đơn.
 *
 * Vì sao cần cả một lớp cho việc này:
 *
 * `POST /api/orders` BẮT BUỘC có `Idempotency-Key`, và backend xử lý nó rất rõ ràng — cùng khoá
 * với cùng nội dung thì trả lại chính đơn cũ; cùng khoá với nội dung KHÁC thì
 * `409 IDEMPOTENCY_KEY_REUSED`. Nên hai cách làm sai đều dẫn tới hậu quả thật:
 *
 * - **Sinh khoá mới mỗi lần gửi** → mạng chập chờn, khách bấm lại, và bếp nhận HAI đơn giống hệt
 *   nhau. Đây đúng là tình huống `Idempotency-Key` sinh ra để chặn, nên sinh khoá mới lúc gửi lại
 *   là vô hiệu hoá nó trong khi vẫn gửi header cho có.
 * - **Giữ nguyên khoá sau khi giỏ đổi** → khách thêm một món rồi bấm đặt, và nhận 409 khó hiểu.
 *
 * Nên luật đúng là: khoá gắn với NỘI DUNG GIỎ, không gắn với lần bấm. Giỏ không đổi thì gửi lại
 * bao nhiêu lần cũng cùng một khoá; giỏ đổi thì khoá mới.
 */
export class KhoaDatDon {
  private khoa: string | null = null;
  private dauVet: string | null = null;

  /**
   * @param sinhChuoi nguồn ngẫu nhiên, tiêm được để test không phụ thuộc may rủi
   */
  constructor(private readonly sinhChuoi: () => string = sinhKhoaNgauNhien) {}

  /** Khoá cho giỏ có dấu vết `dauVet`. */
  khoaCho(dauVet: string): string {
    if (this.khoa === null || this.dauVet !== dauVet) {
      this.khoa = this.sinhChuoi();
      this.dauVet = dauVet;
    }
    return this.khoa;
  }

  /**
   * Quên khoá sau khi đơn đã tạo xong.
   *
   * Không quên thì lần đặt SAU với giỏ trùng nội dung (khách gọi thêm đúng món cũ — chuyện rất
   * thường) sẽ dùng lại khoá cũ và backend trả về chính đơn cũ. Khách bấm đặt, thấy "thành công",
   * mà bếp không nhận gì thêm.
   */
  quen(): void {
    this.khoa = null;
    this.dauVet = null;
  }
}

const BANG_CHU = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Sinh khoá hợp lệ theo đúng ràng buộc của backend: `^[A-Za-z0-9._:-]+$`, tối đa 100 ký tự.
 *
 * Dùng bảng chữ cái an toàn thay vì UUID có dấu gạch nối cho chắc — dấu `-` hợp lệ, nhưng một
 * định dạng tự sinh nằm gọn trong tập ký tự cho phép thì không bao giờ phải nhớ lại điều đó.
 *
 * Dùng `Math.random` chứ không phải nguồn ngẫu nhiên mật mã, và đó là lựa chọn có chủ ý: khoá này
 * KHÔNG phải bí mật. Nó chỉ cần khác nhau giữa các lần đặt của cùng một máy — không ai đoán được
 * nó cũng chẳng làm được gì, vì `POST /api/orders` còn đòi token phiên bàn.
 */
export function sinhKhoaNgauNhien(): string {
  let s = 'ord.';
  for (let i = 0; i < 24; i++) {
    s += BANG_CHU[Math.floor(Math.random() * BANG_CHU.length)];
  }
  return s;
}

/**
 * Khoá có hợp lệ với backend không — chép đúng `RequestIdempotency.KEY_PATTERN`.
 *
 * Tách ra để kiểm được: một khoá lọt ký tự lạ sẽ bị trả `400 IDEMPOTENCY_KEY_INVALID` và khách
 * không đặt được món nào cả, trong khi mã app trông vẫn đúng.
 */
export const MAU_KHOA_HOP_LE = /^[A-Za-z0-9._:-]+$/;

export function khoaHopLe(khoa: string): boolean {
  return khoa.length > 0 && khoa.length <= 100 && MAU_KHOA_HOP_LE.test(khoa);
}
