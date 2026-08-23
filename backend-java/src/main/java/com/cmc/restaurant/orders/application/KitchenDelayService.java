package com.cmc.restaurant.orders.application;

import com.cmc.restaurant.orders.adapter.out.persistence.KitchenDelayEntity;
import com.cmc.restaurant.orders.adapter.out.persistence.KitchenDelayRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Độ trễ do bếp tự khai, cộng vào ước lượng lên món (#142).
 *
 * <h2>Vì sao cần đến con người</h2>
 *
 * <p>{@link OrderItemEstimationService} đọc tải bếp từ hàng đợi đơn. Cách đó đúng, nhưng chỉ thấy
 * được thứ đã đi qua ứng dụng. Nó mù với đúng những nguyên nhân gây trễ nặng nhất: một đầu bếp
 * nghỉ đột xuất, hỏng lò, một đoàn đặt trước đang làm ở trong, hết nguyên liệu phải sơ chế lại.
 *
 * <p>Bếp biết những chuyện đó ngay lúc chúng xảy ra. Đây là đường để bếp nói ra.
 *
 * <h2>Vì sao phải tự hết hạn</h2>
 *
 * <p>Một cờ bật tay mà không có đường tự tắt sẽ hỏng theo cách tệ nhất. Bếp bật lúc bảy giờ tối,
 * ca sau không ai nhớ, và đến mười giờ ứng dụng vẫn cộng thêm hai mươi phút vào một cái bếp trống.
 * Lúc đó nó thôi là công cụ báo trễ và trở thành nguồn sai số thường trực — tệ hơn hẳn so với
 * không có gì, vì người dùng không có cách nào biết con số đang sai.
 *
 * <p>Hết hạn được xét <b>lúc đọc</b>, không cần tiến trình dọn nền. Không có job nào phải chạy
 * đúng giờ để hệ thống cho ra con số đúng; máy chủ chết cả đêm rồi bật lại thì cờ vẫn tự tắt.
 */
@Service
public class KitchenDelayService {

	/**
	 * Cờ sống được bao lâu trước khi tự tắt.
	 *
	 * <p>Chín mươi phút là độ dài một đợt cao điểm. Còn đông thì bếp bấm lại để gia hạn; thao tác
	 * đó rẻ hơn nhiều so với hậu quả của việc quên tắt.
	 */
	static final Duration HAN_HIEU_LUC = Duration.ofMinutes(90);

	/**
	 * Trần độ trễ khai được.
	 *
	 * <p>Trùng với ràng buộc CHECK ở V12, và là giới hạn nghiệp vụ chứ không phải quy tắc nhập
	 * liệu: khi bếp trễ hơn một tiếng thì câu trả lời trung thực là ngừng nhận món, không phải
	 * hiện một con số to hơn cho khách đang ngồi chờ.
	 */
	public static final int TRAN_PHUT = 60;

	private final KitchenDelayRepository repository;
	private final Clock clock;

	// @Autowired bắt buộc vì lớp này có HAI constructor. Không có nó, Spring không chọn được cái
	// nào, quay về tìm constructor rỗng và hỏng lúc khởi động. Lỗi đó hỏng-đóng (service không
	// boot) nên nó dừng ở đây chứ không thành một endpoint 500 trên máy khách — nhưng vẫn nên
	// nói rõ lý do để lần sau ai thêm constructor thứ ba thì biết.
	@Autowired
	public KitchenDelayService(KitchenDelayRepository repository) {
		this(repository, Clock.systemUTC());
	}

	KitchenDelayService(KitchenDelayRepository repository, Clock clock) {
		this.repository = repository;
		this.clock = clock;
	}

	/**
	 * @param delayMinutes    số phút đang cộng thêm; 0 nghĩa là không có độ trễ nào
	 * @param minutesLeft     còn hiệu lực bao lâu nữa, để bảng bếp hiện ra cho người trực thấy
	 * @param updatedBy       ai bấm lần cuối
	 */
	public record KitchenDelayView(int delayMinutes, long minutesLeft, String updatedBy) {
	}

	/**
	 * Số phút phải cộng vào ước lượng lúc này. Trả 0 khi chưa khai hoặc đã hết hạn.
	 *
	 * <p>Đây là hàm mà đường tính tiền gọi, nên nó phải rẻ và không bao giờ ném lỗi: một sự cố ở
	 * tính năng phụ này không được phép làm hỏng việc xem đơn.
	 */
	@Transactional(readOnly = true)
	public int phutTreHienTai() {
		return doc().map(this::conHieuLuc).orElse(0);
	}

	@Transactional(readOnly = true)
	public KitchenDelayView xem() {
		return doc().map(this::thanhView)
				.orElseGet(() -> new KitchenDelayView(0, 0, null));
	}

	/**
	 * Bếp khai độ trễ. Truyền 0 để tắt.
	 *
	 * @throws IllegalArgumentException khi số phút âm hoặc vượt {@link #TRAN_PHUT}
	 */
	@Transactional
	public KitchenDelayView dat(int delayMinutes, String actor) {
		if (delayMinutes < 0 || delayMinutes > TRAN_PHUT) {
			throw new IllegalArgumentException(
					"delayMinutes phải nằm trong khoảng 0.." + TRAN_PHUT);
		}
		OffsetDateTime now = OffsetDateTime.now(clock);
		KitchenDelayEntity row = repository.findById(KitchenDelayEntity.SINGLETON_ID)
				.orElseGet(KitchenDelayService::dongMoi);
		row.setDelayMinutes(delayMinutes);
		// Tắt thì xoá hẳn hạn, không để lại một mốc thời gian đã qua. Một dòng "0 phút, hết hạn
		// lúc 19:32" đọc lên mơ hồ; "0 phút, không có hạn" thì chỉ có một nghĩa.
		row.setExpiresAt(delayMinutes == 0 ? null : now.plus(HAN_HIEU_LUC));
		row.setUpdatedAt(now);
		row.setUpdatedBy(actor);
		return thanhView(repository.save(row));
	}

	private Optional<KitchenDelayEntity> doc() {
		return repository.findById(KitchenDelayEntity.SINGLETON_ID);
	}

	private int conHieuLuc(KitchenDelayEntity row) {
		OffsetDateTime expires = row.getExpiresAt();
		if (expires == null || !expires.isAfter(OffsetDateTime.now(clock))) {
			return 0;
		}
		return row.getDelayMinutes();
	}

	private KitchenDelayView thanhView(KitchenDelayEntity row) {
		int phut = conHieuLuc(row);
		if (phut == 0) {
			return new KitchenDelayView(0, 0, row.getUpdatedBy());
		}
		long conLai = Duration.between(OffsetDateTime.now(clock), row.getExpiresAt()).toMinutes();
		return new KitchenDelayView(phut, Math.max(0, conLai), row.getUpdatedBy());
	}

	private static KitchenDelayEntity dongMoi() {
		KitchenDelayEntity row = new KitchenDelayEntity();
		row.setId(KitchenDelayEntity.SINGLETON_ID);
		return row;
	}
}
