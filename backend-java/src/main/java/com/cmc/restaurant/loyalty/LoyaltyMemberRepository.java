package com.cmc.restaurant.loyalty;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyMemberRepository extends JpaRepository<LoyaltyMemberEntity, String> {

	Optional<LoyaltyMemberEntity> findByPhoneNumber(String phoneNumber);

	/**
	 * Trừ điểm để đổi ưu đãi — KHOÁ CHỐNG TRANH CHẤP nằm ở chính câu lệnh này (#34).
	 *
	 * <p>{@code where ... and points >= :chiPhi} biến việc "kiểm đủ điểm" và "trừ điểm" thành MỘT
	 * thao tác nguyên tử. Hai request song song đọc cùng số dư 100 rồi cùng trừ 60 sẽ không thể
	 * cùng thành công: câu lệnh thứ hai thấy số dư đã là 40 và không khớp điều kiện, nên trả về 0
	 * dòng bị ảnh hưởng.
	 *
	 * <p>Vì sao không dùng {@code @Version} như phần Orders: ở đó bản ghi bị nhiều bên sửa vì
	 * nhiều lý do khác nhau nên cần phát hiện "ai đó đã đổi trong lúc bạn đọc". Ở đây chỉ có đúng
	 * một phép biến đổi (trừ điểm) và đúng một điều kiện (đủ điểm), nên một câu UPDATE có điều
	 * kiện vừa mạnh hơn vừa không bao giờ đỏ oan — không cần vòng thử lại.
	 *
	 * <p>Đánh đổi: trả về 0 dòng KHÔNG phân biệt được "không đủ điểm" với "thua tranh chấp". Với
	 * khách thì hai thứ đó nói cùng một điều, và nơi gọi đọc lại số dư để báo con số thật.
	 *
	 * <p><b>{@code clearAutomatically = true} là bắt buộc, không phải tuỳ chọn.</b> Câu UPDATE hàng
	 * loạt đi thẳng xuống cơ sở dữ liệu và KHÔNG đụng tới persistence context; nếu không xoá
	 * context thì lượt đọc ngay sau đó trả về entity còn nằm trong cache bậc một — tức số điểm CŨ.
	 *
	 * <p>Đã đo thật trước khi thêm cờ này: đổi 60 điểm từ số dư 200 cho ra dữ liệu ĐÚNG trong cơ
	 * sở dữ liệu (140 điểm, sổ đã ghi) nhưng phản hồi trả {@code points = 200}. Khách nhìn thấy số
	 * dư không đổi và sẽ bấm đổi lần nữa.
	 *
	 * @return số dòng bị ảnh hưởng — 1 là trừ được, 0 là không.
	 */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("update LoyaltyMemberEntity m set m.points = m.points - :chiPhi, m.updatedAt = :now "
			+ "where m.id = :memberId and m.points >= :chiPhi")
	int truDiemNeuDu(String memberId, int chiPhi, java.time.OffsetDateTime now);

	// --- quản trị thành viên (#94) ---------------------------------------------------------------

	/** Nhiều điểm lên trước, cùng điểm thì theo số điện thoại — đúng thứ tự bản .NET. */
	List<LoyaltyMemberEntity> findAllByOrderByPointsDescPhoneNumberAsc();

	boolean existsByPhoneNumber(String phoneNumber);

	/** Trùng số với thành viên KHÁC — dùng khi sửa, để không tự báo trùng với chính mình. */
	boolean existsByPhoneNumberAndIdNot(String phoneNumber, String id);
}
