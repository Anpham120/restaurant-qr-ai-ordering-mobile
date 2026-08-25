package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.domain.HetHanDiem;
import com.cmc.restaurant.loyalty.domain.MemberTier;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Việc hằng tháng: xét lại hạng theo cửa sổ 12 tháng, và xoá điểm quá hạn.
 *
 * <p>Không có tác vụ này thì {@code spend_12m} chỉ tăng, và hạng thành viên mắc đúng khuyết điểm
 * của {@code lifetime_spend} — lên được mà không xuống được, tức là không còn là hạng nữa. Luồng
 * thanh toán cố ý chỉ biết cộng vào: nó không có cách nào biết hoá đơn nào vừa rơi khỏi cửa sổ.
 *
 * <p>Chạy 03:00 ngày 1 hằng tháng. Chọn theo tháng chứ không theo ngày vì tụt hạng là chuyện khách
 * cần đoán trước được; xét mỗi ngày sẽ khiến hạng rơi vào một buổi sáng bất kỳ không lý do.
 */
@Component
public class XetLaiHangJob {

	private static final Logger log = LoggerFactory.getLogger(XetLaiHangJob.class);

	private final LoyaltyMemberRepository members;
	private final LoyaltyLedgerRepository soDiem;

	public XetLaiHangJob(LoyaltyMemberRepository members, LoyaltyLedgerRepository soDiem) {
		this.members = members;
		this.soDiem = soDiem;
	}

	@Scheduled(cron = "0 0 3 1 * *", zone = "Asia/Ho_Chi_Minh")
	public void chay() {
		chayLuc(OffsetDateTime.now());
	}

	/**
	 * Tách khỏi {@link #chay()} để gọi được với một mốc thời gian bất kỳ.
	 *
	 * <p>Một tác vụ chỉ chạy được vào 03:00 ngày 1 là một tác vụ chỉ kiểm chứng được mỗi tháng một
	 * lần.
	 */
	@Transactional
	public int chayLuc(OffsetDateTime now) {
		OffsetDateTime dauCuaSo = now.minusMonths(12);
		int daSua = 0;

		for (LoyaltyMemberEntity thanhVien : members.findAll()) {
			boolean coThayDoi = xoaDiemQuaHan(thanhVien, now);
			coThayDoi |= xetLaiHang(thanhVien, dauCuaSo);
			if (coThayDoi) {
				members.save(thanhVien);
				daSua++;
			}
		}

		log.info("Xet lai hang thanh vien: {} ho so thay doi", daSua);
		return daSua;
	}

	private boolean xoaDiemQuaHan(LoyaltyMemberEntity thanhVien, OffsetDateTime now) {
		int canXoa = HetHanDiem.canXoa(
				soDiem.diemTichQuaHan(thanhVien.getId(), now),
				soDiem.diemDaTieu(thanhVien.getId()));

		// Chặn thêm ở đây: số dư mới là nguồn có thẩm quyền, và nếu sổ và số dư từng lệch nhau thì
		// phép trừ trần có thể đẩy số dư xuống âm.
		canXoa = Math.min(canXoa, thanhVien.getPoints());
		if (canXoa <= 0) {
			return false;
		}

		soDiem.save(LoyaltyLedgerEntity.hetHan(
				"lgr_" + UUID.randomUUID().toString().replace("-", ""),
				thanhVien.getId(), canXoa, now));
		thanhVien.setPoints(thanhVien.getPoints() - canXoa);
		return true;
	}

	private boolean xetLaiHang(LoyaltyMemberEntity thanhVien, OffsetDateTime dauCuaSo) {
		BigDecimal chiTieu = soDiem.chiTieuTu(thanhVien.getId(), dauCuaSo);
		MemberTier hangMoi = MemberTier.theoChiTieu(chiTieu);

		if (chiTieu.compareTo(thanhVien.getSpend12m()) == 0 && hangMoi == thanhVien.getTier()) {
			return false;
		}
		thanhVien.setSpend12m(chiTieu);
		thanhVien.setTier(hangMoi);
		return true;
	}
}
