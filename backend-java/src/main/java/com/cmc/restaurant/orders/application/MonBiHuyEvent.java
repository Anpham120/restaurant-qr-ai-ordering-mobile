package com.cmc.restaurant.orders.application;

import java.time.OffsetDateTime;

/**
 * Một món trong đơn vừa bị huỷ — do nhân viên đổi trạng thái hoặc do khách tự huỷ.
 *
 * <p>Tách khỏi {@link DonBiHuyEvent} vì hai chuyện khác hẳn nhau về phạm vi. Huỷ cả đơn thì mọi
 * ưu đãi bám vào đơn đều mất hiệu lực, kể cả khoản giảm tiền. Huỷ MỘT món thì chỉ đúng lần đổi
 * sinh ra món đó bị hoàn — khoản giảm trên hoá đơn vẫn còn nguyên giá trị vì hoá đơn vẫn còn.
 *
 * <p>Vì thế sự kiện này mang {@code orderItemId}: một đơn có thể có hai món tặng từ hai lần đổi
 * khác nhau, và huỷ một món không được hoàn cả hai.
 */
public record MonBiHuyEvent(String orderCode, String orderItemId, OffsetDateTime luc) {
}
