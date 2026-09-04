import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EN_COPY, translate } from "@cmc/i18n";
import { describe, expect, it } from "vitest";
import { labelGuestItemStatus, labelGuestOrderStatus } from "../utils/opsStatusLabels";

const goc = new URL("../../", import.meta.url);

function moiTepNguon(duongDan: string): string[] {
  const tuyetDoi = fileURLToPath(new URL(duongDan, goc));
  if (statSync(tuyetDoi).isFile()) return [tuyetDoi];
  return readdirSync(tuyetDoi, { withFileTypes: true }).flatMap((muc) => {
    const con = `${duongDan.replace(/\/$/, "")}/${muc.name}`;
    if (muc.isDirectory()) return moiTepNguon(con);
    return /\.(ts|tsx)$/.test(muc.name) && !/\.test\./.test(muc.name)
      ? [fileURLToPath(new URL(con, goc))]
      : [];
  });
}

/** Mọi màn hình KHÁCH nhìn thấy. Quầy, bếp và quản trị không nằm ở đây. */
const MAN_CUA_KHACH = [
  "src/ordering",
  "src/pages/customer",
  "src/components/customer",
  "src/components/menu",
  "apps/ordering-web/src",
];

/*
  BA LẦN CÙNG MỘT LỖI trong hai ngày, nên đây là cửa cho cả LỚP thay vì vá lần thứ tư.

  Lỗi: màn của khách mượn bộ chữ của người vận hành. "Sẵn sàng", "Đã phục vụ" là ngôn ngữ của quầy;
  khách không cần biết đơn "sẵn sàng", họ cần biết món có đang trên đường ra bàn hay không.

  Ba lần đã xảy ra:
    1. `OrderTrackingPage` giữ hai bảng chữ riêng cho trạng thái MÓN
    2. cùng màn đó, `timelineLabels` và `eventStatusLabels` cho trạng thái ĐƠN
    3. `SessionOrdersPage` gọi `labelOrderStatus` ở dòng trạng thái cuối thẻ đơn

  Lần thứ ba đứng cách lần thứ hai đúng MỘT CÚ CHẠM: khách đọc "Sẵn sàng" ở danh sách rồi bấm vào
  chi tiết thấy "Nấu xong, chờ mang ra".
*/
describe("màn của khách chỉ dùng bộ chữ của khách", () => {
  const tep = MAN_CUA_KHACH.flatMap(moiTepNguon);

  it("quét được thật, không phải danh sách rỗng", () => {
    // Đối chứng cho chính cửa này. Sai một đường dẫn thì vòng lặp duyệt qua 0 tệp và mọi ca dưới
    // đây xanh vĩnh viễn mà không canh gì.
    expect(tep.length).toBeGreaterThan(20);
  });

  it("không màn nào gọi bộ nhãn của QUẦY", () => {
    const pham: string[] = [];
    for (const t of tep) {
      if (/\blabelOrderStatus\s*\(/.test(readFileSync(t, "utf8"))) {
        pham.push(t.replace(/.*[\/]frontend[\/]/, ""));
      }
    }
    expect(pham).toEqual([]);
  });

  it("chuỗi tới hàm dịch qua BIẾN cũng phải có bản tiếng Anh", () => {
    // Cửa phủ ngôn ngữ sẵn có chỉ quét chuỗi viết thẳng tại chỗ gọi. Ba câu đã lọt qua nó và nói
    // tiếng Việt với khách chọn English: nhãn món, nhãn đơn, và câu "bếp đang đông".
    //
    // Ca này kiểm từ HÀM sinh nhãn chứ không từ mã nguồn, nên nó thấy đúng chỗ cửa kia mù.
    const cau = [
      ...["Pending", "Preparing", "Ready", "Served", "Cancelled"].map((s) =>
        labelGuestItemStatus(s, "Preparing"),
      ),
      ...[
        "Draft",
        "Placed",
        "Confirmed",
        "Preparing",
        "Ready",
        "Served",
        "Completed",
        "Cancelled",
      ].map(labelGuestOrderStatus),
    ];

    for (const c of cau) {
      expect(EN_COPY[c], `thiếu bản tiếng Anh cho "${c}"`).toBeTruthy();
      expect(translate("en", c)).not.toBe(c);
    }
  });
});
