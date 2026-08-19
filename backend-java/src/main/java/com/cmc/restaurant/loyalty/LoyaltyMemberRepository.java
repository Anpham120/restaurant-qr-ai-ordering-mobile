package com.cmc.restaurant.loyalty;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyMemberRepository extends JpaRepository<LoyaltyMemberEntity, String> {

	Optional<LoyaltyMemberEntity> findByPhoneNumber(String phoneNumber);

	// --- quản trị thành viên (#94) ---------------------------------------------------------------

	/** Nhiều điểm lên trước, cùng điểm thì theo số điện thoại — đúng thứ tự bản .NET. */
	List<LoyaltyMemberEntity> findAllByOrderByPointsDescPhoneNumberAsc();

	boolean existsByPhoneNumber(String phoneNumber);

	/** Trùng số với thành viên KHÁC — dùng khi sửa, để không tự báo trùng với chính mình. */
	boolean existsByPhoneNumberAndIdNot(String phoneNumber, String id);
}
