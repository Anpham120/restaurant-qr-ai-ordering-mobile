package com.cmc.restaurant.orders.application;

import java.time.OffsetDateTime;

/**
 * Đơn vừa bị huỷ.
 *
 * <p>Orders công bố sự kiện này chứ không gọi thẳng module nào. Lý do không phải là gọn gàng: đơn
 * bị huỷ là một sự thật của Orders, đúng dù có ai quan tâm hay không. Gọi thẳng sang Loyalty sẽ
 * bắt Orders biết rằng chương trình tích điểm tồn tại, và mỗi module quan tâm thêm về sau lại thêm
 * một dòng vào giữa luồng huỷ đơn.
 *
 * <p>Người nghe chạy ĐỒNG BỘ trong cùng transaction với lệnh huỷ. Cố ý: nếu hoàn điểm hỏng thì
 * lệnh huỷ cũng phải cuộn ngược, chứ không để lại một đơn đã huỷ mà điểm khách vẫn mất.
 */
public record DonBiHuyEvent(String orderCode, OffsetDateTime luc) {
}
