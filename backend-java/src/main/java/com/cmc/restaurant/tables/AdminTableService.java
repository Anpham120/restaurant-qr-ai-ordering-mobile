package com.cmc.restaurant.tables;

import com.cmc.restaurant.shared.ApiException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Mirrors phần quản trị bàn của {@code Tables/TableEndpoints.cs} (.NET) — issue #91. */
@Service
public class AdminTableService {

	/** Bản .NET cấp mã trong khoảng T01..T99 rồi báo hết chỗ. Giữ nguyên trần này. */
	private static final int MAX_TABLES = 99;

	private final RestaurantTableRepository tableRepository;
	private final TableSessionRepository sessionRepository;
	private final TableInvoiceRepository invoiceRepository;

	public AdminTableService(
			RestaurantTableRepository tableRepository, TableSessionRepository sessionRepository,
			TableInvoiceRepository invoiceRepository) {
		this.tableRepository = tableRepository;
		this.sessionRepository = sessionRepository;
		this.invoiceRepository = invoiceRepository;
	}

	@Transactional(readOnly = true)
	public List<RestaurantTableEntity> list() {
		return tableRepository.findAllByOrderByTableCodeAsc();
	}

	@Transactional
	public RestaurantTableEntity create(AdminTableDtos.CreateTableRequest request) {
		if (request == null || request.displayName() == null || request.displayName().isBlank()) {
			throw ApiException.badRequest("REQUEST_INVALID", "displayName is required.");
		}

		String tableCode;
		if (request.tableCode() == null || request.tableCode().isBlank()) {
			tableCode = allocateNextTableCode();
		} else {
			tableCode = TableSessionService.normalizeTableCode(request.tableCode());
			if (tableCode == null) {
				throw ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01.");
			}
		}

		if (tableRepository.existsByTableCode(tableCode)) {
			throw ApiException.conflict("TABLE_CODE_EXISTS", "Table code is already in use.");
		}

		OffsetDateTime now = OffsetDateTime.now();
		RestaurantTableEntity table = new RestaurantTableEntity(
				"tbl_" + UUID.randomUUID().toString().replace("-", ""),
				tableCode, request.displayName().trim(), now);
		TableQrTokenRotator.rotate(table, now);
		return tableRepository.save(table);
	}

	@Transactional
	public RestaurantTableEntity update(String rawTableCode, AdminTableDtos.UpdateTableRequest request) {
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "Request body is required.");
		}
		RestaurantTableEntity table = requireTable(rawTableCode);

		// Chỉ chặn khi ĐANG bật mà muốn tắt. Tắt một bàn đã tắt sẵn thì không cần chặn gì —
		// và quan trọng hơn: sửa TÊN một bàn đang có khách thì vẫn phải cho phép.
		if (Boolean.FALSE.equals(request.isActive()) && table.isActive()) {
			requireNoBlockingActivity(table);
		}

		if (request.displayName() != null) {
			String trimmed = request.displayName().trim();
			if (trimmed.isEmpty()) {
				throw ApiException.badRequest("DISPLAY_NAME_INVALID", "displayName must not be empty.");
			}
			table.rename(trimmed);
		}
		if (request.isActive() != null) {
			table.setActive(request.isActive());
		}
		table.touch(OffsetDateTime.now());
		return tableRepository.save(table);
	}

	/**
	 * Cấp mã QR mới, vô hiệu mã cũ ngay lập tức.
	 *
	 * <p>Chặn khi bàn còn phiên mở hoặc còn hoá đơn chờ thanh toán: xoay mã lúc đó sẽ khoá luôn
	 * khách đang ngồi ra khỏi phiên của chính họ — QR trên bàn không còn mở được gì.
	 */
	@Transactional
	public RestaurantTableEntity rotateQr(String rawTableCode) {
		RestaurantTableEntity table = requireTable(rawTableCode);
		requireNoBlockingActivity(table);
		TableQrTokenRotator.rotate(table, OffsetDateTime.now());
		return tableRepository.save(table);
	}

	// --- helper ---------------------------------------------------------------------------------

	private RestaurantTableEntity requireTable(String rawTableCode) {
		String tableCode = TableSessionService.normalizeTableCode(rawTableCode);
		if (tableCode == null) {
			throw ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01.");
		}
		return tableRepository.findByTableCode(tableCode)
				.orElseThrow(() -> ApiException.notFound("TABLE_NOT_FOUND", "Table was not found."));
	}

	/** Mirrors {@code GetTableMutationBlockReasonAsync} — hai lý do, theo đúng thứ tự của .NET. */
	private void requireNoBlockingActivity(RestaurantTableEntity table) {
		if (sessionRepository.hasActiveSession(table.getId(), OffsetDateTime.now())) {
			throw ApiException.conflict("TABLE_SESSION_OPEN",
					"Close the open table session before deactivating the table or rotating its QR code.");
		}
		if (invoiceRepository.existsPendingForTable(table.getId())) {
			throw ApiException.conflict("TABLE_INVOICE_PAYMENT_PENDING",
					"Complete or cancel the pending table invoice before deactivating the table or "
							+ "rotating its QR code.");
		}
	}

	private String allocateNextTableCode() {
		List<String> existing = tableRepository.findAll().stream()
				.map(RestaurantTableEntity::getTableCode)
				.map(code -> code == null ? "" : code.toUpperCase(Locale.ROOT))
				.toList();
		for (int index = 1; index <= MAX_TABLES; index++) {
			String candidate = String.format("T%02d", index);
			if (!existing.contains(candidate)) {
				return candidate;
			}
		}
		throw ApiException.conflict("TABLE_CAPACITY_REACHED", "No available table codes remain.");
	}

	public static AdminTableDtos.AdminTableResponse toResponse(RestaurantTableEntity table) {
		return new AdminTableDtos.AdminTableResponse(
				table.getTableCode(), table.getDisplayName(), table.isActive(), table.getQrToken(),
				buildCustomerPath(table.getTableCode(), table.getQrToken()));
	}

	/** Mirrors {@code BuildCustomerPath}: {@code Uri.EscapeDataString} mã hoá dấu cách thành %20,
	 * còn {@code URLEncoder} cho ra dấu cộng — cùng chỗ đã phải sửa ở VietQR (#11). */
	private static String buildCustomerPath(String tableCode, String qrToken) {
		if (tableCode == null || tableCode.isBlank() || qrToken == null || qrToken.isBlank()) {
			return "/";
		}
		return "/table/" + escape(tableCode) + "?qr=" + escape(qrToken);
	}

	private static String escape(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
	}
}
