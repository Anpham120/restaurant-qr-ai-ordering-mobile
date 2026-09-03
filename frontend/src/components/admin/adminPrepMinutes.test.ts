import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const doc = (duongDan: string) =>
  readFileSync(fileURLToPath(new URL(duongDan, import.meta.url)), "utf8");

/**
 * Đường GHI cho thời gian lên món, phía giao diện.
 *
 * <p>V11 tạo cột `prep_minutes`, điền giá trị khởi tạo suy từ nhãn `method:`, và ghi trong chính
 * migration rằng "bếp sửa lại qua PATCH khi thấy sai". Lời hứa đó chưa bao giờ thành: entity không
 * ánh xạ cột, DTO không có trường, và ở đây — màn quản trị thực đơn — không có ô.
 *
 * <p>Nghĩa là con số mà MỌI ước lượng thời gian lên món dựa vào chỉ có một người từng ghi được:
 * người viết migration, một lần, bằng ước lượng của chính họ chứ không phải của bếp.
 */
describe("ô khai thời gian lên món ở màn quản trị thực đơn", () => {
  const form = doc("./AdminMenuManager.tsx");

  it("có ô nhập, và nó nằm trong biểu mẫu sửa món", () => {
    expect(form).toContain('id="amm-prep-minutes"');
    expect(form).toContain("Thời gian lên món (phút)");
    expect(form).toContain('htmlFor="amm-prep-minutes"');
  });

  it("NẠP LẠI giá trị đang có khi mở món để sửa", () => {
    // Thiếu dòng này thì ô luôn trống lúc mở, người quản trị tưởng món chưa khai, và mỗi lần sửa
    // tên món là một lần con số cũ bị thay bằng thứ họ gõ vào ô trống.
    expect(form).toContain("prepMinutes: item.prepMinutes ?? null");
  });

  it("ô trống gửi đi là null, KHÔNG phải 0", () => {
    // `Number("")` là 0. Gửi 0 lên thì máy chủ chặn vì ngoài ngưỡng, và người quản trị nhận một lỗi
    // khó hiểu chỉ vì họ không muốn khai món đó.
    expect(form).toContain('e.target.value === "" ? null : Number(e.target.value)');
  });

  it("ngưỡng của ô KHỚP ngưỡng máy chủ chặn", () => {
    // Ô rộng hơn máy chủ thì người dùng gõ xong mới biết bị chặn; ô hẹp hơn thì có giá trị hợp lệ
    // mà không nhập được. Cả hai đều là lỗi báo sai chỗ.
    const service = doc(
      "../../../../backend-java/src/main/java/com/cmc/restaurant/menu/MenuItemService.java",
    );
    const nguongMayChu = /MAX_PREP_MINUTES = (\d+);/.exec(service)?.[1];
    expect(nguongMayChu).toBe("240");
    expect(form).toContain("min={1}");
    expect(form).toContain(`max={${nguongMayChu}}`);
  });

  it("nói rõ đây là THỜI GIAN LÊN MÓN, không phải thời gian nấu", () => {
    // Chỗ dễ điền sai nhất. Phở ninh nước dùng cả đêm nhưng múc ra bát chỉ vài phút — điền tổng
    // thời gian nấu thì mọi món nước báo hàng tiếng và không ai tin ước lượng nữa.
    expect(form).toContain("KHÔNG phải tổng thời gian nấu");
  });
});
