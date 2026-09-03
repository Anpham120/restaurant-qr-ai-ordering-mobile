/**
 * Tiền khách đưa ở quầy: đọc ô nhập, tính tiền thối, và chặn nút khi khách đưa thiếu.
 *
 * <p>Luật thật nằm ở máy chủ ({@code TienKhachDua}) — đây là bản chạy trước để người đứng quầy
 * thấy ngay, không phải để thay thế. Hai bên phải nói CÙNG một điều: cho bấm rồi mới báo lỗi là
 * đúng cái nhầm lẫn mà tính năng này sinh ra để chặn.
 */

/**
 * Chỉ giữ lại chữ số của thứ người ta vừa gõ.
 *
 * <p><b>LỖI CÓ THẬT.</b> Bản đầu viết thẳng trong JSX là {@code replace(/[^d]/g, "")} — thiếu dấu
 * gạch chéo ngược, nên nó xoá mọi ký tự KHÔNG PHẢI chữ `d`. Gõ "50000" vào ô "Khách đưa" thì ô tự
 * xoá sạch và không bao giờ nhận được số nào. Ô nhập hoàn toàn không dùng được.
 *
 * <p>Lọt được vì mọi phép kiểm đều gọi thẳng {@code docTienDua}/{@code tinhThoiLai} với chuỗi
 * dựng sẵn, không đi qua ô nhập. Tách ra thành hàm là để nó nằm trong tầm phép kiểm.
 */
export function chiGiuChuSo(nhapVao: string): string {
  return nhapVao.replace(/[^0-9]/g, "");
}

/** Chuỗi trong ô nhập thành số, hoặc {@code undefined} khi để trống. */
export function docTienDua(nhapVao: string | undefined): number | undefined {
  // Để TRỐNG nghĩa là khách đưa đúng — khác hẳn gõ 0 nghĩa là khách đưa 0 đồng. Trả 0 ở đây làm
  // máy chủ từ chối mọi hoá đơn mà người ta không buồn nhập gì.
  if (nhapVao === undefined || nhapVao.trim() === "") return undefined;
  const so = Number(nhapVao);
  return Number.isFinite(so) ? so : undefined;
}

/** Tiền phải thối, hoặc {@code null} khi chưa nhập hoặc nhập thiếu. */
export function tinhThoiLai(nhapVao: string | undefined, tong: number): number | null {
  const dua = docTienDua(nhapVao);
  if (dua === undefined) return null;
  const thoi = Math.floor(dua) - Math.floor(tong);
  return thoi < 0 ? null : thoi;
}

/** Có đang nhập một số NHỎ HƠN hoá đơn không — dùng để tắt nút xác nhận. */
export function thieuTien(nhapVao: string | undefined, tong: number): boolean {
  const dua = docTienDua(nhapVao);
  // Chưa nhập thì KHÔNG phải thiếu: đó là ca "khách đưa đúng", và tắt nút ở đó là chặn đường
  // thường gặp nhất.
  if (dua === undefined) return false;
  return Math.floor(dua) < Math.floor(tong);
}
