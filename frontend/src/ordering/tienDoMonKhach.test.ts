import { describe, expect, it } from "vitest";
import { demTienDoMon, monVuaSanSang } from "./tienDoMonKhach";

const mon = (id: string, name: string, status: string) => ({ orderItemId: id, name, status });

describe("đếm tiến độ món cho khách", () => {
  it("TÁCH món đã lên bàn khỏi món đang mang ra", () => {
    // Đây là ca chính. Trước bản này hai trạng thái bị gộp thành một con số "món đã sẵn sàng": ăn
    // hết 3 món, món thứ 4 đang được bưng ra, khách đọc "4/4 món đã sẵn sàng" trong khi trên bàn
    // mới có 3. Với người đang ngồi ăn, "đã ở trước mặt" và "chưa ra" là hai việc khác hẳn nhau.
    const tienDo = demTienDoMon([
      mon("1", "Phở", "Served"),
      mon("2", "Nem", "Served"),
      mon("3", "Chè", "Ready"),
      mon("4", "Trà đá", "Preparing"),
    ]);
    expect(tienDo).toEqual({ daLen: 2, dangMangRa: 1, tong: 4 });
  });

  it("món chưa nấu xong KHÔNG bị đếm vào ô nào", () => {
    // Đối chứng cho phép cộng: `Pending` và `Preparing` không phải "đã lên", cũng không phải
    // "đang mang ra". Thiếu ca này thì một hàm đếm mọi món là "đang mang ra" vẫn xanh.
    expect(demTienDoMon([mon("1", "Phở", "Served"), mon("2", "Nem", "Pending")]))
      .toEqual({ daLen: 1, dangMangRa: 0, tong: 2 });
  });

  it("món đã HUỶ không nằm trong mẫu số — khách không chờ món đã huỷ", () => {
    const tienDo = demTienDoMon([
      mon("1", "Phở", "Served"),
      mon("2", "Nem", "Cancelled"),
      mon("3", "Chè", "Pending"),
    ]);
    expect(tienDo).toEqual({ daLen: 1, dangMangRa: 0, tong: 2 });
  });

  it("chưa gọi món thì mẫu số bằng 0 để nơi gọi biết mà KHÔNG vẽ gì", () => {
    // "Đã lên 0/0 món" là câu vô nghĩa. Màn hình dựa vào `tong === 0` để bỏ qua.
    expect(demTienDoMon([]).tong).toBe(0);
    expect(demTienDoMon([mon("1", "Phở", "Cancelled")]).tong).toBe(0);
  });
});

describe("món vừa xong giữa hai lần hỏi", () => {
  it("gọi TÊN món vừa sang 'đang mang ra'", () => {
    // Báo "đơn có cập nhật" không cho khách biết nên làm gì. Khách đang chờ MỘT món cụ thể.
    const truoc = [mon("1", "Phở bò", "Preparing"), mon("2", "Chè", "Pending")];
    const sau = [mon("1", "Phở bò", "Ready"), mon("2", "Chè", "Pending")];
    expect(monVuaSanSang(truoc, sau)).toEqual(["Phở bò"]);
  });

  it("lần tải ĐẦU không báo gì", () => {
    // Chưa có gì để so. Dội một loạt tên món đang sẵn sàng ngay lúc mở màn là báo thứ khách đã biết.
    expect(monVuaSanSang([], [mon("1", "Phở", "Ready"), mon("2", "Chè", "Ready")])).toEqual([]);
  });

  it("món ĐÃ Ready từ trước KHÔNG bị báo lại mỗi lần hỏi", () => {
    // Đối chứng. Thiếu ca này thì một hàm chỉ lọc `status === 'Ready'` vẫn xanh, và khách bị dội
    // đúng một dải báo mỗi 12 giây suốt bữa ăn.
    const truoc = [mon("1", "Phở", "Ready")];
    const sau = [mon("1", "Phở", "Ready")];
    expect(monVuaSanSang(truoc, sau)).toEqual([]);
  });

  it("so theo MÃ MÓN, không theo vị trí trong mảng", () => {
    // Bếp huỷ một món thì mảng ngắn lại. So theo vị trí sẽ báo nhầm gần hết danh sách.
    const truoc = [
      mon("1", "Phở", "Preparing"),
      mon("2", "Nem", "Preparing"),
      mon("3", "Chè", "Preparing"),
    ];
    const sau = [mon("2", "Nem", "Preparing"), mon("3", "Chè", "Ready")];
    expect(monVuaSanSang(truoc, sau)).toEqual(["Chè"]);
  });

  it("nhiều món xong cùng lúc thì gọi đủ tên", () => {
    const truoc = [mon("1", "Phở", "Preparing"), mon("2", "Nem", "Preparing")];
    const sau = [mon("1", "Phở", "Ready"), mon("2", "Nem", "Ready")];
    expect(monVuaSanSang(truoc, sau)).toEqual(["Phở", "Nem"]);
  });

  it("món nhảy thẳng từ chờ nấu sang xong vẫn được báo", () => {
    // Bếp làm xong mà không kịp bấm "đang nấu" là chuyện thường; backend cho nhảy cóc.
    expect(monVuaSanSang([mon("1", "Trà đá", "Pending")], [mon("1", "Trà đá", "Ready")]))
      .toEqual(["Trà đá"]);
  });
});
