import type { OrderStatus } from "../types";
import type { PaymentMethod, PaymentStatus } from "../types/order";

const ORDER_STATUS_VI: Record<string, string> = {
  Draft: "Bản nháp",
  Placed: "Đã gửi",
  Confirmed: "Đã xác nhận",
  Preparing: "Đang chế biến",
  Ready: "Sẵn sàng",
  Served: "Đã phục vụ",
  Completed: "Hoàn tất",
  Cancelled: "Đã hủy",
};

const PAYMENT_STATUS_VI: Record<string, string> = {
  NotRequested: "Chưa yêu cầu thu",
  Unpaid: "Chưa thanh toán",
  Pending: "Chờ thu",
  Paid: "Đã thanh toán",
  Confirmed: "Đã xác nhận thu",
  Failed: "Thất bại",
  Cancelled: "Đã hủy",
  Refunded: "Đã hoàn",
};

const PAYMENT_METHOD_VI: Record<string, string> = {
  Unselected: "Chưa chọn",
  COD: "Tiền mặt",
  VietQR: "VietQR",
};

/**
 * Nhãn trạng thái MÓN cho KHÁCH.
 *
 * Viết theo VIỆC ĐÃ XẢY RA với món của khách, không theo tên trạng thái của hệ thống. "Sẵn sàng
 * phục vụ" là ngôn ngữ của người vận hành; người đang ngồi ăn cần biết món đang trên đường ra.
 *
 * PHẢI KHỚP TỪNG CHỮ với `nhanTrangThaiMon` bên app (`mobile-rn/src/core/orders/order.ts`). Hai
 * kho không dùng chung mã được, nên mỗi bên có một phép kiểm ghim đúng chuỗi này — đổi một bên mà
 * quên bên kia thì phép kiểm bên đó đỏ.
 *
 * Trước đây hai bên nói hai kiểu cho cùng một trạng thái: app "Nấu xong", web "Sẵn sàng phục vụ".
 * Nhóm khách một người mở app một người quét web sẽ thấy hai câu khác nhau cho cùng một món.
 *
 * `Pending` là "Đã gửi bếp" chứ không "Chờ xác nhận" — không có gì để khách xác nhận cả, đơn đã
 * gửi rồi. Câu cũ làm khách tưởng còn phải bấm thêm gì đó.
 */
const ITEM_STATUS_VI: Record<string, string> = {
  Pending: "Đã gửi bếp, chờ tới lượt",
  Preparing: "Đang làm món của bạn",
  Ready: "Món xong, đang mang ra bàn",
  Served: "Đã mang ra bàn",
  Cancelled: "Đã huỷ",
};

/**
 * Nhãn trạng thái ĐƠN cho KHÁCH.
 *
 * <p>Khác `labelOrderStatus` — bộ đó viết cho QUẦY ("Sẵn sàng", "Đã phục vụ"), là ngôn ngữ của
 * người vận hành. Khách không cần biết đơn "sẵn sàng"; họ cần biết món có đang trên đường ra bàn
 * hay không.
 *
 * <p>PHẢI KHỚP TỪNG CHỮ với `nhanTrangThaiDon` bên app (`mobile-rn/src/core/orders/order.ts`).
 * Cùng một lý do như nhãn món: hai kho không dùng chung mã được, nên mỗi bên ghim chuỗi và lệch
 * nhau thì bên đó đỏ.
 *
 * <p>`Placed` và `Confirmed` KHÁC nhau ở đây, không như bên bếp: với khách, "đã gửi bếp" và "bếp
 * đã nhận" là hai tin khác nhau — tin thứ hai nói có người thật đã thấy đơn.
 */
const GUEST_ORDER_STATUS_VI: Record<string, string> = {
  Draft: "Nháp",
  Placed: "Đã gửi bếp",
  Confirmed: "Bếp đã nhận",
  Preparing: "Đang nấu",
  Ready: "Nấu xong, chờ mang ra",
  Served: "Đã mang ra bàn",
  Completed: "Đã thanh toán",
  Cancelled: "Đã huỷ",
};

export function labelGuestOrderStatus(status: string): string {
  return GUEST_ORDER_STATUS_VI[status] ?? status;
}

export function labelOrderStatus(status: OrderStatus | string): string {
  return ORDER_STATUS_VI[status] ?? status;
}

export function labelPaymentStatus(status: PaymentStatus | string): string {
  return PAYMENT_STATUS_VI[status] ?? status;
}

export function labelPaymentMethod(method: PaymentMethod | string): string {
  return PAYMENT_METHOD_VI[method] ?? method;
}

export function labelPaymentChip(method: PaymentMethod | string, status: PaymentStatus | string): string {
  return `${labelPaymentMethod(method)} · ${labelPaymentStatus(status)}`;
}

/** Guest item chip: after order is staff-confirmed, Pending means waiting for kitchen — not staff confirm. */
/**
 * Nhãn món cho khách.
 *
 * <p>Không còn rẽ nhánh theo trạng thái ĐƠN. Bản trước phải rẽ vì `Pending` mang nhãn "Chờ xác
 * nhận" — sai khi bếp đã nhận đơn — nên nó vá bằng cách đổi sang "Chờ chế biến" trong đúng những
 * ca đó. Sửa thẳng câu gốc thì cái vá thành thừa.
 *
 * <p>Ca `Cancelled` cũng không cần rẽ: huỷ đơn tự huỷ mọi món còn sống (`Order.java:86-88`), nên
 * món của một đơn đã huỷ luôn đọc ra "Đã huỷ" mà không cần ai kể cho nó biết đơn đang thế nào.
 *
 * <p>Giữ tham số `orderStatus` để nơi gọi không phải sửa, và để nếu sau này có ca thật sự cần rẽ
 * thì chỗ rẽ đã sẵn.
 */
export function labelGuestItemStatus(itemStatus: string, _orderStatus: string): string {
  return ITEM_STATUS_VI[itemStatus] ?? itemStatus;
}
