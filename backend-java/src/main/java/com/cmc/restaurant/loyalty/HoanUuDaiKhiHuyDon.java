package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.orders.application.DonBiHuyEvent;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Đơn bị huỷ thì trả lại điểm đã tiêu cho đơn đó.
 *
 * <p>Trước lớp này, huỷ một đơn có ưu đãi là khách mất trắng: món tặng biến mất cùng đơn, khoản
 * giảm không còn ý nghĩa, mà điểm thì đã trừ và không có đường nào quay lại. Bếp làm nhầm rồi huỷ
 * đơn là chuyện hằng ngày, nên đây không phải trường hợp hiếm gặp.
 *
 * <p>Trả lại ĐIỂM chứ không khôi phục phiếu. Một cơ chế cho cả hai loại ưu đãi, và điểm là thứ
 * khách hiểu ngay — họ đổi lại được đúng ưu đãi cũ hoặc đổi thứ khác. Khôi phục phiếu thì phải
 * quyết định phiếu ấy còn hạn bao lâu, và câu hỏi đó không có câu trả lời đúng.
 */
@Component
public class HoanUuDaiKhiHuyDon {

	private static final Logger log = LoggerFactory.getLogger(HoanUuDaiKhiHuyDon.class);

	private final LoyaltyRedemptionRepository phieu;
	private final LoyaltyMemberRepository members;
	private final LoyaltyLedgerRepository soDiem;

	public HoanUuDaiKhiHuyDon(
			LoyaltyRedemptionRepository phieu, LoyaltyMemberRepository members,
			LoyaltyLedgerRepository soDiem) {
		this.phieu = phieu;
		this.members = members;
		this.soDiem = soDiem;
	}

	@EventListener
	@Transactional
	public void hoan(DonBiHuyEvent suKien) {
		List<LoyaltyRedemptionEntity> canHoan =
				phieu.findByOrderCodeAndReversedAtIsNull(suKien.orderCode());
		if (canHoan.isEmpty()) {
			return;
		}

		OffsetDateTime now = suKien.luc();
		for (LoyaltyRedemptionEntity r : canHoan) {
			members.congDiem(r.getMemberId(), r.getPointsSpent(), now);
			soDiem.save(LoyaltyLedgerEntity.hoanLai(
					"lgr_" + UUID.randomUUID().toString().replace("-", ""),
					r.getMemberId(), r.getPointsSpent(), suKien.orderCode(), now));

			// Đánh dấu SAU khi đã cộng điểm và ghi sổ. Đánh dấu trước rồi cộng điểm hỏng sẽ để lại
			// một lần đổi mang tiếng "đã hoàn" mà khách chưa nhận lại đồng điểm nào — và lần chạy
			// sau sẽ bỏ qua nó vì tưởng đã xong.
			r.danhDauDaHoan(now);
			phieu.save(r);

			log.info("Hoan {} diem cho {} vi don {} bi huy",
					r.getPointsSpent(), r.getMemberId(), suKien.orderCode());
		}
	}
}
