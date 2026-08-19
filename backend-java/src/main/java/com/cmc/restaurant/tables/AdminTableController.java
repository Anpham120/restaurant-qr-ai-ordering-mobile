package com.cmc.restaurant.tables;

import com.cmc.restaurant.orders.application.OrderLookup;
import com.cmc.restaurant.shared.ApiException;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mirrors 5 endpoint quản trị bàn trong {@code Tables/TableEndpoints.cs} (.NET) — issue #91.
 *
 * <p>Quyền đặt ở TỪNG phương thức, không đặt ở cấp lớp, vì bản .NET không đồng nhất và sự khác
 * biệt đó có lý: hai endpoint ĐỌC mở cho {@code Staff}/{@code CounterStaff}/{@code Admin} (nhân
 * viên phục vụ cần xem bàn nào đang có khách), còn ba endpoint GHI chỉ {@code Admin} — tạo bàn,
 * tắt bàn và xoay mã QR đều là thao tác ảnh hưởng tới cả nhà hàng.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminTableController {

	private final AdminTableService adminTables;
	private final TableSessionRepository sessionRepository;
	private final OrderLookup orderLookup;

	public AdminTableController(
			AdminTableService adminTables, TableSessionRepository sessionRepository, OrderLookup orderLookup) {
		this.adminTables = adminTables;
		this.sessionRepository = sessionRepository;
		this.orderLookup = orderLookup;
	}

	@GetMapping("/tables")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public AdminTableDtos.AdminTableListResponse list() {
		List<AdminTableDtos.AdminTableResponse> items =
				adminTables.list().stream().map(AdminTableService::toResponse).toList();
		return new AdminTableDtos.AdminTableListResponse(items, items.size());
	}

	@PostMapping("/tables")
	@PreAuthorize("hasRole('Admin')")
	public ResponseEntity<AdminTableDtos.AdminTableResponse> create(
			@RequestBody(required = false) AdminTableDtos.CreateTableRequest request) {
		AdminTableDtos.AdminTableResponse created = AdminTableService.toResponse(adminTables.create(request));
		return ResponseEntity.created(URI.create("/api/admin/tables/" + created.tableCode())).body(created);
	}

	@PatchMapping("/tables/{tableCode}")
	@PreAuthorize("hasRole('Admin')")
	public AdminTableDtos.AdminTableResponse update(
			@PathVariable String tableCode,
			@RequestBody(required = false) AdminTableDtos.UpdateTableRequest request) {
		return AdminTableService.toResponse(adminTables.update(tableCode, request));
	}

	@PostMapping("/tables/{tableCode}/qr/rotate")
	@PreAuthorize("hasRole('Admin')")
	public AdminTableDtos.AdminTableResponse rotateQr(@PathVariable String tableCode) {
		return AdminTableService.toResponse(adminTables.rotateQr(tableCode));
	}

	@GetMapping("/table-sessions")
	@PreAuthorize("hasAnyRole('Staff', 'CounterStaff', 'Admin')")
	public AdminTableDtos.AdminTableSessionListResponse listSessions(
			@RequestParam(required = false) String status) {
		List<TableSessionEntity> sessions;
		if (status == null || status.isBlank()) {
			sessions = sessionRepository.findAllForAdmin();
		} else {
			sessions = sessionRepository.findAllForAdminByStatus(parseStatus(status));
		}

		// Một truy vấn cho tất cả phiên — xem OrderLookup.countActiveOrdersByTableSession().
		Map<String, Integer> activeOrders = orderLookup.countActiveOrdersByTableSession();
		OffsetDateTime now = OffsetDateTime.now();

		List<AdminTableDtos.AdminTableSessionSummary> items = sessions.stream()
				.map(session -> new AdminTableDtos.AdminTableSessionSummary(
						session.getId(),
						session.getTableCode() != null ? session.getTableCode()
								: session.getRestaurantTable() != null
										? session.getRestaurantTable().getTableCode() : "",
						session.getRestaurantTable() == null ? null
								: session.getRestaurantTable().getDisplayName(),
						session.getStatus().name(),
						session.getOpenedAt(),
						session.getExpiresAt(),
						session.getClosedAt(),
						session.isExpired(now),
						activeOrders.getOrDefault(session.getId(), 0)))
				.toList();

		return new AdminTableDtos.AdminTableSessionListResponse(items, items.size());
	}

	/** Bản .NET dùng {@code Enum.TryParse(ignoreCase: true)}; giữ nguyên tính không phân biệt hoa thường. */
	private static TableSessionStatus parseStatus(String status) {
		for (TableSessionStatus candidate : TableSessionStatus.values()) {
			if (candidate.name().equalsIgnoreCase(status.trim())) {
				return candidate;
			}
		}
		throw ApiException.badRequest("TABLE_SESSION_STATUS_INVALID", "Table session status is invalid.");
	}
}
