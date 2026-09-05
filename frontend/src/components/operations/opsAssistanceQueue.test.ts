import { describe, expect, it } from "vitest";
import type { OpsAssistanceAlert } from "./OpsAssistanceProvider";
import { daDieuPhoi, phutDaCho, themYeuCau } from "./opsAssistanceQueue";

const yc = (tableCode: string, requestedAt: string): OpsAssistanceAlert => ({
  id: `${tableCode}-${requestedAt}`,
  tableCode,
  tableSessionId: "ts_1",
  note: null,
  requestedAt,
});

describe("hàng chờ điều phối nhân viên", () => {
  it("bàn vừa gọi nằm trên đầu", () => {
    const ds = themYeuCau([yc("T01", "2026-09-03T10:00:00Z")], yc("T05", "2026-09-03T10:02:00Z"));

    expect(ds.map((x) => x.tableCode)).toEqual(["T05", "T01"]);
  });

  it("cùng một yêu cầu KHÔNG hiện hai dòng", () => {
    // Kết nối thời gian thực nối lại sẽ phát lại sự kiện. Hai dòng y hệt khiến người ở quầy tưởng
    // có hai bàn đang gọi và cử người đi hai lần.
    const mot = yc("T05", "2026-09-03T10:02:00Z");
    const ds = themYeuCau([mot], { ...mot });

    expect(ds).toHaveLength(1);
  });

  it("cùng một bàn gọi LẦN NỮA thì là yêu cầu mới", () => {
    // Khách bấm lần hai nghĩa là lần đầu chưa ai tới. Gộp vào một dòng là làm mất chính thông tin
    // đó — quầy cần thấy bàn này đang gọi lại.
    const ds = themYeuCau(
      [yc("T05", "2026-09-03T10:02:00Z")],
      yc("T05", "2026-09-03T10:09:00Z"),
    );

    expect(ds).toHaveLength(2);
  });

  it("cử người xong thì rời hàng chờ", () => {
    const mot = yc("T05", "2026-09-03T10:02:00Z");
    const ds = daDieuPhoi([mot, yc("T01", "2026-09-03T10:00:00Z")], mot.id);

    expect(ds.map((x) => x.tableCode)).toEqual(["T01"]);
  });

  it("không dài quá giới hạn", () => {
    let ds: OpsAssistanceAlert[] = [];
    for (let i = 0; i < 9; i += 1) ds = themYeuCau(ds, yc(`T0${i}`, `2026-09-03T10:0${i}:00Z`));

    expect(ds).toHaveLength(5);
  });

  it("đếm đúng số phút đã chờ", () => {
    // Con số quyết định thứ tự điều phối khi nhiều bàn cùng gọi. Người ở quầy không tự tính được
    // trong lúc đang thu tiền.
    const bayGio = Date.parse("2026-09-03T10:08:00Z");

    expect(phutDaCho("2026-09-03T10:02:00Z", bayGio)).toBe(6);
    expect(phutDaCho("2026-09-03T10:08:00Z", bayGio)).toBe(0);
  });

  it("thời điểm hỏng thì trả 0, không trả NaN", () => {
    // NaN lọt ra giao diện thành "NaN phút" giữa màn hình của người đang bận.
    expect(phutDaCho("khong-phai-ngay")).toBe(0);
  });

  it("thời điểm ở tương lai không cho ra số ÂM", () => {
    const bayGio = Date.parse("2026-09-03T10:00:00Z");

    expect(phutDaCho("2026-09-03T10:05:00Z", bayGio)).toBe(0);
  });
});
