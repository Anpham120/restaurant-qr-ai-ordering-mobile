package com.cmc.restaurant.payments;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cấu hình SePay.
 *
 * <p>CHỈ có khoá webhook. Tài khoản ngân hàng nằm ở {@link VietQrProperties} và không chép sang
 * đây: hai bản sao của cùng một số tài khoản sẽ trôi khỏi nhau — sửa một chỗ, quên chỗ kia — và
 * hậu quả là mã QR chỉ khách một tài khoản còn đối soát trông chờ tài khoản khác, nên tiền vào mà
 * không đơn nào được đánh dấu đã trả.
 *
 * @param apiKey khoá gửi kèm header {@code Authorization: Apikey ...}. Để trống thì webhook TỪ
 *               CHỐI mọi lời gọi — thà không đối soát tự động còn hơn nhận một thân request giả và
 *               đánh dấu đơn đã trả tiền.
 */
@ConfigurationProperties(prefix = "payments.sepay")
public record SePayProperties(String apiKey) {
}
