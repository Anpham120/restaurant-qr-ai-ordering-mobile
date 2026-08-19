package com.cmc.restaurant.promotions;

import com.cmc.restaurant.promotions.AdminPromotionDtos.PromotionRequest;
import com.cmc.restaurant.promotions.AdminPromotionDtos.PromotionResponse;
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
 * Mirrors nhóm {@code /api/admin/promotions} trong {@code PromotionEndpoints.cs} (.NET) — #93.
 *
 * <p>Toàn bộ nhóm là {@code AdminOnly} ở bản .NET, nên {@code @PreAuthorize} đặt ở cấp lớp — khác
 * {@code AdminTableController} (#91), nơi quyền đọc và ghi khác nhau nên phải đặt theo phương thức.
 */
@RestController
@RequestMapping("/api/admin/promotions")
@PreAuthorize("hasRole('Admin')")
public class AdminPromotionController {

	private final AdminPromotionService promotions;

	public AdminPromotionController(AdminPromotionService promotions) {
		this.promotions = promotions;
	}

	@GetMapping
	public List<PromotionResponse> list() {
		return promotions.list().stream().map(AdminPromotionService::toResponse).toList();
	}

	@GetMapping("/{promotionId}")
	public PromotionResponse get(@PathVariable String promotionId) {
		return AdminPromotionService.toResponse(promotions.get(promotionId));
	}

	@PostMapping
	public ResponseEntity<PromotionResponse> create(@RequestBody(required = false) PromotionRequest request) {
		PromotionResponse created = AdminPromotionService.toResponse(promotions.create(request));
		return ResponseEntity.created(URI.create("/api/admin/promotions/" + created.promotionId())).body(created);
	}

	@PutMapping("/{promotionId}")
	public PromotionResponse update(
			@PathVariable String promotionId, @RequestBody(required = false) PromotionRequest request) {
		return AdminPromotionService.toResponse(promotions.update(promotionId, request));
	}

	@DeleteMapping("/{promotionId}")
	public ResponseEntity<Void> delete(@PathVariable String promotionId) {
		promotions.delete(promotionId);
		return ResponseEntity.noContent().build();
	}
}
