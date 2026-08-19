package com.cmc.restaurant.loyalty;

import com.cmc.restaurant.loyalty.AdminLoyaltyDtos.LoyaltyMemberRequest;
import com.cmc.restaurant.loyalty.AdminLoyaltyDtos.LoyaltyMemberResponse;
import com.cmc.restaurant.loyalty.AdminLoyaltyDtos.LoyaltyRewardRequest;
import com.cmc.restaurant.loyalty.AdminLoyaltyDtos.LoyaltyRewardResponse;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors hai nhóm quản trị trong {@code LoyaltyEndpoints.cs} (.NET) — 9 endpoint, issue #94.
 *
 * <p>Một controller cho cả thành viên và ưu đãi vì bản .NET đặt chúng cạnh nhau dưới cùng tiền tố
 * {@code /api/admin/loyalty} và cùng {@code AdminOnly}. Tách đôi sẽ tạo hai lớp mỗi lớp ba bốn
 * phương thức mà không tách được gì về trách nhiệm.
 *
 * <p>Lưu ý bất đối xứng CÓ THẬT của bản .NET: thành viên có {@code GET /{memberId}} nhưng ưu đãi
 * thì KHÔNG — chỉ có danh sách. Giữ nguyên; thêm một endpoint không có ở bản .NET sẽ làm bảng
 * kiểm kê hai bên lệch nhau theo chiều ngược lại.
 */
@RestController
@RequestMapping("/api/admin/loyalty")
@PreAuthorize("hasRole('Admin')")
public class AdminLoyaltyController {

	private final AdminLoyaltyService loyalty;

	public AdminLoyaltyController(AdminLoyaltyService loyalty) {
		this.loyalty = loyalty;
	}

	// --- thành viên -----------------------------------------------------------------------------

	@GetMapping("/members")
	public List<LoyaltyMemberResponse> listMembers() {
		return loyalty.listMembers().stream().map(AdminLoyaltyService::toResponse).toList();
	}

	@GetMapping("/members/{memberId}")
	public LoyaltyMemberResponse getMember(@PathVariable String memberId) {
		return AdminLoyaltyService.toResponse(loyalty.getMember(memberId));
	}

	@PostMapping("/members")
	public ResponseEntity<LoyaltyMemberResponse> createMember(
			@RequestBody(required = false) LoyaltyMemberRequest request) {
		LoyaltyMemberResponse created = AdminLoyaltyService.toResponse(loyalty.createMember(request));
		return ResponseEntity.created(URI.create("/api/admin/loyalty/members/" + created.memberId()))
				.body(created);
	}

	@PutMapping("/members/{memberId}")
	public LoyaltyMemberResponse updateMember(
			@PathVariable String memberId, @RequestBody(required = false) LoyaltyMemberRequest request) {
		return AdminLoyaltyService.toResponse(loyalty.updateMember(memberId, request));
	}

	@DeleteMapping("/members/{memberId}")
	public ResponseEntity<Void> deleteMember(@PathVariable String memberId) {
		loyalty.deleteMember(memberId);
		return ResponseEntity.noContent().build();
	}

	// --- ưu đãi ---------------------------------------------------------------------------------

	@GetMapping("/rewards")
	public List<LoyaltyRewardResponse> listRewards() {
		return loyalty.listRewards().stream().map(AdminLoyaltyService::toResponse).toList();
	}

	@PostMapping("/rewards")
	public ResponseEntity<LoyaltyRewardResponse> createReward(
			@RequestBody(required = false) LoyaltyRewardRequest request) {
		LoyaltyRewardResponse created = AdminLoyaltyService.toResponse(loyalty.createReward(request));
		return ResponseEntity.created(URI.create("/api/admin/loyalty/rewards/" + created.rewardId()))
				.body(created);
	}

	@PutMapping("/rewards/{rewardId}")
	public LoyaltyRewardResponse updateReward(
			@PathVariable String rewardId, @RequestBody(required = false) LoyaltyRewardRequest request) {
		return AdminLoyaltyService.toResponse(loyalty.updateReward(rewardId, request));
	}

	@DeleteMapping("/rewards/{rewardId}")
	public ResponseEntity<Void> deleteReward(@PathVariable String rewardId) {
		loyalty.deleteReward(rewardId);
		return ResponseEntity.noContent().build();
	}
}
