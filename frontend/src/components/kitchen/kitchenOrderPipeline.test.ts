import { describe, expect, it } from "vitest";
import type { Order } from "@cmc/shared-types";
import { labelGuestItemStatus } from "../../utils/opsStatusLabels";
import {
  canDropKitchenOrder,
  getItemTapAdvanceStatus,
  itemActionLabel,
  labelKitchenColumn,
  labelKitchenItemStatus,
  labelKitchenOrderStatus,
  moTaChipMon,
  getKitchenBoardAdvancePlan,
  getKitchenBoardColumn,
  getKitchenPrimaryAction,
  getKitchenPriority,
  getKitchenProgress,
  getNextKitchenBoardColumn,
  isKitchenActiveOrderStatus,
  sortKitchenOrdersByPriority,
} from "./kitchenOrderPipeline";

const sampleOrder = (code: string, createdAt: string, status: Order["status"]): Order => ({
  orderId: code,
  orderCode: code,
  tableCode: "T01",
  tableSessionId: null,
  status,
  paymentStatus: "Unpaid",
  paymentMethod: "COD",
  totalAmount: 100000,
  createdAt,
  updatedAt: createdAt,
  items: [
    {
      orderItemId: "i1",
      menuItemId: "m1",
      name: "Pho",
      quantity: 1,
      unitPrice: 50000,
      lineTotal: 50000,
      status: "Pending",
      updatedAt: createdAt,
    },
    {
      orderItemId: "i2",
      menuItemId: "m2",
      name: "Nuoc",
      quantity: 1,
      unitPrice: 50000,
      lineTotal: 50000,
      status: "Preparing",
      updatedAt: createdAt,
    },
  ],
});

describe("kitchen order pipeline", () => {
  it("shows newly placed orders in the new-order column", () => {
    expect(getKitchenBoardColumn("Placed")).toBe("confirmed");
    expect(getKitchenBoardColumn("Confirmed")).toBe("confirmed");
    expect(isKitchenActiveOrderStatus("Placed")).toBe(true);
  });

  it("keeps only active kitchen statuses on the board", () => {
    expect(getKitchenBoardColumn("Preparing")).toBe("preparing");
    expect(getKitchenBoardColumn("Ready")).toBe("ready");
    expect(getKitchenBoardColumn("Served")).toBe("served");
    expect(isKitchenActiveOrderStatus("Served")).toBe(true);
    expect(getKitchenBoardColumn("Completed")).toBeNull();
    expect(getKitchenBoardColumn("Cancelled")).toBeNull();
  });

  it("advances each card exactly one lane at a time", () => {
    expect(getKitchenBoardAdvancePlan("Placed")).toEqual({
      kind: "items",
      eligibleItemStatuses: ["Pending"],
      nextItemStatus: "Preparing",
    });
    expect(getKitchenBoardAdvancePlan("Preparing")).toEqual({
      kind: "items",
      eligibleItemStatuses: ["Pending", "Preparing"],
      nextItemStatus: "Ready",
    });
    expect(getKitchenBoardAdvancePlan("Ready")).toEqual({
      kind: "order",
      nextOrderStatus: "Served",
    });
    expect(getKitchenBoardAdvancePlan("Served")).toBeNull();
  });

  it("accepts drag/drop only into the immediate next lane", () => {
    expect(getNextKitchenBoardColumn("Placed")).toBe("preparing");
    expect(getNextKitchenBoardColumn("Preparing")).toBe("ready");
    expect(getNextKitchenBoardColumn("Ready")).toBe("served");
    expect(getNextKitchenBoardColumn("Served")).toBeNull();

    expect(canDropKitchenOrder("Placed", "preparing")).toBe(true);
    expect(canDropKitchenOrder("Preparing", "ready")).toBe(true);
    expect(canDropKitchenOrder("Ready", "served")).toBe(true);
    expect(canDropKitchenOrder("Placed", "ready")).toBe(false);
    expect(canDropKitchenOrder("Preparing", "confirmed")).toBe(false);
    expect(canDropKitchenOrder("Served", "ready")).toBe(false);
  });

  it("prioritizes urgent and older orders first", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    const sorted = sortKitchenOrdersByPriority([
      sampleOrder("NEW", "2026-01-01T11:50:00.000Z", "Placed"),
      sampleOrder("OLD", "2026-01-01T11:20:00.000Z", "Placed"),
      sampleOrder("MID", "2026-01-01T11:35:00.000Z", "Placed"),
    ], now);
    expect(sorted.map((order) => order.orderCode)).toEqual(["OLD", "MID", "NEW"]);
    expect(getKitchenPriority(sampleOrder("OLD", "2026-01-01T11:20:00.000Z", "Placed"), now)).toBe("urgent");
  });

  it("derives progress and smart action labels", () => {
    const order = sampleOrder("O1", "2026-01-01T12:00:00.000Z", "Placed");
    expect(getKitchenProgress(order)).toEqual({
      ready: 0,
      total: 2,
      percent: 0,
      cooking: 1,
      pending: 1,
    });
    expect(getItemTapAdvanceStatus("Pending")).toBe("Preparing");
    expect(getKitchenPrimaryAction(order).label).toContain("Nấu 1 món");
  });
});

describe("chạm từng món đi hết vòng đời", () => {
  it("Ready còn đi tiếp được sang Served", () => {
    // NGHIỆP VỤ: một đơn nhiều món KHÔNG bao giờ lên cùng lúc. Bếp làm xong món nào đưa món đó,
    // và phải gạch được đúng món đó.
    //
    // Bản trước dừng ở `Ready` rồi trả `null`, nên bước "đã mang ra bàn" CHỈ có ở cấp đơn — muốn
    // đánh dấu một món đã lên thì phải đánh dấu cả 4-5 món cùng lúc. Backend không hề chặn:
    // `OrderItem.canTransitionTo` cho `Ready -> Served` từ đầu. Đây thuần là đường cụt ở giao diện.
    expect(getItemTapAdvanceStatus("Ready")).toBe("Served");
  });

  it("đi đúng thứ tự, không nhảy cóc ở giao diện", () => {
    expect(getItemTapAdvanceStatus("Pending")).toBe("Preparing");
    expect(getItemTapAdvanceStatus("Preparing")).toBe("Ready");
  });

  it("mỗi bước chạm đều có CHỮ trên nút", () => {
    // LỖI CÓ THẬT, tự gây ra: mở rộng `getItemTapAdvanceStatus` thêm bước `Ready -> Served` mà
    // quên `itemActionLabel`, nên món đã xong hiện một nút RỖNG ở bảng chi tiết. Người trực bếp
    // thấy một nút không chữ và không biết bấm vào thì chuyện gì xảy ra.
    //
    // Hai hàm này phải đi cùng nhau, nên ca kiểm buộc chúng đi cùng: thêm bước mới mà quên nhãn
    // thì ca này đỏ.
    for (const s of ["Pending", "Preparing", "Ready"] as const) {
      expect(itemActionLabel(s)).not.toBe("");
    }
    expect(itemActionLabel("Pending")).toBe("Bắt đầu nấu");
    expect(itemActionLabel("Preparing")).toBe("Nấu xong");
    expect(itemActionLabel("Ready")).toBe("Ra món");
  });

  it("món đã tới điểm cuối thì KHÔNG có nút", () => {
    // Chuỗi rỗng là tín hiệu cho nơi gọi đừng vẽ nút, không phải một nhãn bị quên.
    expect(itemActionLabel("Served")).toBe("");
    expect(itemActionLabel("Cancelled")).toBe("");
  });

  it("Served và Cancelled là điểm cuối — chạm nữa không làm gì", () => {
    // Đối chứng. Thiếu ca này thì một hàm luôn trả bước kế tiếp vẫn xanh, và người trực bếp chạm
    // nhầm vào món đã xong sẽ đẩy nó tới một trạng thái không tồn tại.
    expect(getItemTapAdvanceStatus("Served")).toBeNull();
    expect(getItemTapAdvanceStatus("Cancelled")).toBeNull();
  });
});

describe("từ vựng của bếp — một trạng thái, một tên gọi", () => {
  it("nhãn món nói bằng lời của BẾP, không phải lời của quầy hay của khách", () => {
    // "Ra món" chứ không "phục vụ": người đứng bếp không phục vụ ai cả, họ đẩy món qua cửa ra.
    // Giữ vậy thì chữ của bếp cũng không đụng chữ của khách ("Đã mang ra bàn") — hai việc khác
    // nhau, hai người khác nhau, và trên thực tế lệch nhau vài phút.
    expect(labelKitchenItemStatus("Pending")).toBe("Chờ nấu");
    expect(labelKitchenItemStatus("Preparing")).toBe("Đang nấu");
    expect(labelKitchenItemStatus("Ready")).toBe("Chờ ra món");
    expect(labelKitchenItemStatus("Served")).toBe("Đã ra món");
    expect(labelKitchenItemStatus("Cancelled")).toBe("Đã huỷ");
  });

  it("CỘT và MÓN TRONG CỘT gọi cùng một tên", () => {
    // Đây là ca chính của bản này. Trước đây cột đề "Sẵn sàng", badge trong bảng đề "Xong, chờ đưa",
    // nút đề "Đưa món đi" — ba tên cho một trạng thái, cùng hiện một lúc trên một màn hình. Người
    // trực bếp phải tự dịch giữa chúng.
    expect(labelKitchenColumn("preparing")).toBe(labelKitchenItemStatus("Preparing"));
    expect(labelKitchenColumn("ready")).toBe(labelKitchenItemStatus("Ready"));
    expect(labelKitchenColumn("served")).toBe(labelKitchenItemStatus("Served"));
    expect(labelKitchenColumn("confirmed")).toBe("Đơn mới");
  });

  it("ĐƠN và MÓN cũng gọi cùng một tên", () => {
    expect(labelKitchenOrderStatus("Preparing")).toBe(labelKitchenItemStatus("Preparing"));
    expect(labelKitchenOrderStatus("Ready")).toBe(labelKitchenItemStatus("Ready"));
    expect(labelKitchenOrderStatus("Served")).toBe(labelKitchenItemStatus("Served"));
    // Với bếp, `Placed` và `Confirmed` là một: chưa động vào.
    expect(labelKitchenOrderStatus("Placed")).toBe("Đơn mới");
    expect(labelKitchenOrderStatus("Confirmed")).toBe("Đơn mới");
  });

  it("NÚT là động từ dẫn thẳng tới TRẠNG THÁI kế tiếp", () => {
    // Quy tắc của bộ từ: đọc nút là biết bấm xong sẽ thấy chữ gì. Bấm "Nấu xong" thì món sang
    // "Chờ ra món"; bấm "Ra món" thì món sang "Đã ra món".
    expect(itemActionLabel("Pending")).toBe("Bắt đầu nấu");
    expect(itemActionLabel("Preparing")).toBe("Nấu xong");
    expect(itemActionLabel("Ready")).toBe("Ra món");
  });

  it("không nhãn bếp nào rơi về chuỗi tiếng Anh", () => {
    for (const s of ["Pending", "Preparing", "Ready", "Served", "Cancelled"]) {
      expect(labelKitchenItemStatus(s)).not.toBe(s);
    }
    for (const s of ["Draft", "Placed", "Confirmed", "Preparing", "Ready", "Served", "Completed", "Cancelled"]) {
      expect(labelKitchenOrderStatus(s)).not.toBe(s);
    }
  });

  it("trạng thái LẠ trả nguyên văn, không nuốt thành một câu chung chung", () => {
    // Backend thêm trạng thái mới trước khi web kịp cập nhật là chuyện có thật. Hiện "Đang xử lý"
    // cho mọi thứ chưa biết sẽ giấu mất chuyện đó.
    expect(labelKitchenItemStatus("TrangThaiMoi")).toBe("TrangThaiMoi");
    expect(labelKitchenOrderStatus("TrangThaiMoi")).toBe("TrangThaiMoi");
  });

  it("nhãn bếp KHÁC HẲN nhãn của khách, không chỉ khác cách viết", () => {
    // Khách đọc "Món xong, đang mang ra bàn"; bếp đọc "Chờ ra món". Một bảng bếp dùng câu viết cho
    // khách sẽ dài gấp ba lần chỗ nó có — và nói sai việc: món chưa đi đâu cả, nó đang đứng ở quầy.
    expect(labelKitchenItemStatus("Ready")).not.toBe(labelGuestItemStatus("Ready", "Ready"));
    for (const s of ["Pending", "Preparing", "Ready", "Served", "Cancelled"]) {
      expect(labelKitchenItemStatus(s).length).toBeLessThanOrEqual(labelGuestItemStatus(s, "Ready").length);
    }
  });

  it("chip món nói được TRẠNG THÁI bằng chữ, không chỉ bằng màu", () => {
    // Chip trên thẻ chỉ vẽ "2× Phở" và để MÀU nói trạng thái; chữ nằm trong `title`, mà `title` chỉ
    // hiện khi rê chuột — màn bếp là màn CHẠM, không có chuột. Nên với trình đọc màn hình trạng
    // thái của chip trước đây không tồn tại.
    expect(moTaChipMon(2, "Phở bò", "Preparing")).toBe("2× Phở bò — Đang nấu. Chạm để nấu xong");
    expect(moTaChipMon(1, "Trà đá", "Ready")).toBe("1× Trà đá — Chờ ra món. Chạm để ra món");
  });

  it("món ở điểm cuối thì chip KHÔNG hứa một cú chạm không có thật", () => {
    expect(moTaChipMon(1, "Trà đá", "Served")).toBe("1× Trà đá — Đã ra món");
    expect(moTaChipMon(1, "Trà đá", "Cancelled")).toBe("1× Trà đá — Đã huỷ");
  });

  it("nút của cả ĐƠN dùng đúng động từ của bộ từ, và KHÔNG hứa việc không xảy ra", () => {
    // Nút cũ đề "Báo đã phục vụ" kèm chú thích "Gửi thông báo cho quầy / phục vụ". Không có ai nhận
    // thông báo đó: nhân viên phục vụ không cầm máy, họ nhận lệnh qua bộ đàm. Chú thích mới chỉ nói
    // đúng thứ thật sự xảy ra — cả đơn rời bếp.
    const order = sampleOrder("O1", "2026-01-01T12:00:00.000Z", "Ready");
    expect(getKitchenPrimaryAction(order).label).toBe("Ra hết món");
    expect(getKitchenPrimaryAction(order).detail).toBe("Cả đơn rời bếp");
    expect(getKitchenPrimaryAction(order).detail).not.toContain("thông báo");

    const dangNau = sampleOrder("O2", "2026-01-01T12:00:00.000Z", "Preparing");
    expect(getKitchenPrimaryAction(dangNau).label).toContain("Nấu xong");
  });
});
