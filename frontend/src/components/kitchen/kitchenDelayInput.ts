/**
 * Ô nhập số phút trễ do bếp tự khai.
 *
 * <p>Thay cho ba nút cố định +10 / +20 / +30. Ba mức đó là phỏng đoán của người viết mã về việc
 * bếp trễ bao nhiêu; bếp thì biết con số thật. Trễ 7 phút mà chỉ bấm được 10 nghĩa là hoặc khai
 * quá tay, hoặc thôi không khai — và cả hai đều làm ước lượng sai theo cách không ai truy ra được.
 *
 * <p>Tách khỏi màn hình vì phần khó ở đây KHÔNG phải vẽ ô nhập, mà là những giá trị người ta gõ
 * vào một ô trống. Cùng bài học với ô "Khách đưa" ở màn thu ngân: ở đó một biểu thức chính quy
 * viết sai làm ô xoá sạch thứ vừa gõ, và lỗi chỉ lộ ra khi bấm thật.
 */

/** Trần nghiệp vụ, PHẢI khớp {@code KitchenDelayService.TRAN_PHUT} bên máy chủ. */
export const TRAN_PHUT = 60;

export type KetQuaDoc =
  | { hopLe: true; phut: number }
  | { hopLe: false; loi: string };

/**
 * Đọc số phút người trực bếp gõ vào.
 *
 * <p>Trả về LỖI CỤ THỂ chứ không chỉ true/false: người đang đứng bếp giữa ca cao điểm cần biết
 * ngay phải sửa gì, không phải đoán xem ô đỏ vì lý do nào.
 */
export function docSoPhut(thoNhap: string): KetQuaDoc {
  const tho = thoNhap.trim();

  // Ô TRỐNG KHÔNG PHẢI SỐ 0. `Number("")` cho 0, và 0 nghĩa là TẮT cờ trễ — nên một ô trống bị
  // đọc thành 0 sẽ lặng lẽ tắt độ trễ mà người bấm tưởng mình vừa đặt nó.
  if (tho === "") {
    return { hopLe: false, loi: "Nhập số phút." };
  }

  // Chỉ nhận chữ số. `Number("12abc")` là NaN nhưng `Number(" 12 ")` là 12 và `Number("1e3")` là
  // 1000 — dựa vào `Number` một mình thì "1e3" lọt qua thành 1000 phút.
  if (!/^\d+$/.test(tho)) {
    return { hopLe: false, loi: "Chỉ nhập chữ số." };
  }

  const phut = Number(tho);

  // 0 là hợp lệ ở máy chủ (nghĩa là tắt), nhưng ở ô này thì không: đã có nút "Tắt" riêng, và gõ 0
  // vào ô "cộng thêm" là câu vô nghĩa. Nói rõ đường đúng thay vì im lặng làm một việc khác.
  if (phut === 0) {
    return { hopLe: false, loi: 'Muốn tắt thì bấm nút "Tắt".' };
  }

  // Chặn ở đây thay vì để máy chủ trả lỗi: cùng một giới hạn, nhưng báo trước khi mất một lượt
  // gọi mạng, và câu chữ nói được VÌ SAO.
  if (phut > TRAN_PHUT) {
    return {
      hopLe: false,
      loi: `Tối đa ${TRAN_PHUT} phút. Trễ hơn thế thì nên ngừng nhận món, không phải hiện số to hơn.`,
    };
  }

  return { hopLe: true, phut };
}

/**
 * Lọc phím gõ vào ô: giữ lại chữ số.
 *
 * <p>Tách riêng khỏi {@link docSoPhut} vì hai việc khác nhau — cái này chạy mỗi lần gõ, cái kia
 * chạy lúc gửi đi. Gộp làm một thì ô sẽ báo lỗi ngay khi người ta mới gõ chữ số đầu tiên.
 */
export function chiGiuChuSo(tho: string): string {
  return tho.replace(/\D/g, "");
}
