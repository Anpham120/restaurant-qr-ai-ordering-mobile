import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TRAN_PHUT, chiGiuChuSo, docSoPhut } from "./kitchenDelayInput";

/**
 * Ô nhập số phút trễ, thay cho ba nút cố định +10 / +20 / +30.
 *
 * <p>Ba mức đó là phỏng đoán của người viết mã về việc bếp trễ bao nhiêu. Bếp thì biết con số
 * thật: trễ 7 phút mà chỉ bấm được 10 nghĩa là hoặc khai quá tay, hoặc thôi không khai — và cả
 * hai đều làm ước lượng sai theo cách không ai truy ra được.
 */
describe("đọc số phút bếp gõ vào", () => {
  it("số bình thường thì nhận", () => {
    expect(docSoPhut("7")).toEqual({ hopLe: true, phut: 7 });
    expect(docSoPhut(" 25 ")).toEqual({ hopLe: true, phut: 25 });
    expect(docSoPhut("60")).toEqual({ hopLe: true, phut: 60 });
  });

  it("Ô TRỐNG không phải số 0", () => {
    // `Number("")` cho 0, và 0 nghĩa là TẮT cờ trễ. Một ô trống bị đọc thành 0 sẽ lặng lẽ tắt độ
    // trễ trong khi người bấm tưởng mình vừa đặt nó — rồi ước lượng của cả bếp tụt xuống mà không
    // ai chạm vào gì.
    expect(docSoPhut("")).toEqual({ hopLe: false, loi: "Nhập số phút." });
    expect(docSoPhut("   ")).toEqual({ hopLe: false, loi: "Nhập số phút." });
  });

  it('gõ 0 thì chỉ đường sang nút "Tắt", không im lặng làm việc khác', () => {
    const kq = docSoPhut("0");
    expect(kq.hopLe).toBe(false);
    expect(kq.hopLe === false && kq.loi).toContain("Tắt");
  });

  it("KHÔNG để lọt dạng số mũ", () => {
    // Đây là ca dễ bỏ sót nhất. `Number("1e3")` là 1000 — dựa vào `Number` một mình thì người gõ
    // nhầm "1e3" đặt được 1000 phút trễ, và máy chủ mới là nơi chặn.
    expect(docSoPhut("1e3").hopLe).toBe(false);
    expect(docSoPhut("12abc").hopLe).toBe(false);
    expect(docSoPhut("-5").hopLe).toBe(false);
    expect(docSoPhut("7.5").hopLe).toBe(false);
  });

  it("chặn vượt trần NGAY tại ô, kèm lý do", () => {
    // Cùng giới hạn với máy chủ, nhưng báo trước khi mất một lượt gọi mạng — và câu chữ nói được
    // VÌ SAO có trần, không chỉ nói "sai".
    const kq = docSoPhut("61");
    expect(kq.hopLe).toBe(false);
    expect(kq.hopLe === false && kq.loi).toContain("ngừng nhận món");
  });

  it("trần của ô KHỚP trần của máy chủ", () => {
    // Ô rộng hơn máy chủ thì người dùng gõ xong mới biết bị chặn; hẹp hơn thì có giá trị hợp lệ mà
    // không nhập được.
    expect(TRAN_PHUT).toBe(60);
    expect(docSoPhut(String(TRAN_PHUT)).hopLe).toBe(true);
    expect(docSoPhut(String(TRAN_PHUT + 1)).hopLe).toBe(false);
  });
});

describe("lọc phím gõ vào ô", () => {
  it("giữ lại chữ số, bỏ phần còn lại", () => {
    // Ca đối chứng có thật: ở ô "Khách đưa" bên màn thu ngân, một biểu thức viết thiếu dấu gạch
    // chéo thành `[^d]` và ô xoá sạch mọi thứ vừa gõ. Ca này ghim đúng hành vi đó.
    expect(chiGiuChuSo("d1d5d")).toBe("15");
    expect(chiGiuChuSo("20 phút")).toBe("20");
    expect(chiGiuChuSo("")).toBe("");
  });

  it("KHÔNG báo lỗi khi mới gõ được chữ số đầu", () => {
    // Lọc phím và kiểm giá trị là hai việc khác nhau. Gộp làm một thì ô đỏ ngay lúc người ta mới
    // gõ "6" trên đường tới "60".
    expect(chiGiuChuSo("6")).toBe("6");
  });
});

describe("màn bếp thật sự dùng ô nhập, không còn nút cố định", () => {
  const man = readFileSync(
    fileURLToPath(new URL("../../pages/kitchen/KitchenRealtimePage.tsx", import.meta.url)),
    "utf8",
  );

  it("ba nút cố định đã GỠ", () => {
    // Nếu để lại vừa nút vừa ô thì màn hình có hai đường làm cùng một việc, và người trực bếp
    // phải chọn — trong khi cả lý do thay là ba mức kia không đủ.
    expect(man).not.toContain("[10, 20, 30]");
  });

  it("ô nhập nối vào ĐÚNG hàm đọc, không tự đọc lấy", () => {
    // Màn hình tự gọi `Number(...)` là chỗ những ca như "1e3" và ô trống lọt qua.
    expect(man).toContain("docSoPhut(phutNhap)");
    expect(man).toContain("chiGiuChuSo(e.target.value)");
  });

  it("trần của ô lấy từ hằng số dùng chung, không gõ lại con số", () => {
    expect(man).toContain("max={TRAN_PHUT}");
  });

  it("Enter cũng gửi được — bếp gõ số xong không phải với chuột", () => {
    expect(man).toContain('e.key === "Enter"');
  });
});
