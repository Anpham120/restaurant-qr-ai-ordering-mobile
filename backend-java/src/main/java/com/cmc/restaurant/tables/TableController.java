package com.cmc.restaurant.tables;

import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableDtos.OpenTableSessionRequest;
import com.cmc.restaurant.tables.TableDtos.OpenTableSessionResponse;
import com.cmc.restaurant.tables.TableDtos.TableResponse;
import com.cmc.restaurant.tables.TableDtos.TableSessionResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mirrors the public + session-lifecycle subset of {@code TableEndpoints.cs} (.NET). Admin table
 * management (create/list/rotate QR) is out of scope for this issue — see PR description. */
@RestController
public class TableController {

	private final RestaurantTableRepository tableRepository;
	private final TableSessionService sessionService;
	private final TableInvoiceService invoiceService;
	private final TableSessionActivityService activityService;

	public TableController(
			RestaurantTableRepository tableRepository, TableSessionService sessionService,
			TableInvoiceService invoiceService, TableSessionActivityService activityService) {
		this.tableRepository = tableRepository;
		this.sessionService = sessionService;
		this.invoiceService = invoiceService;
		this.activityService = activityService;
	}

	@GetMapping("/api/tables/{tableCode}")
	public TableResponse getTable(@PathVariable String tableCode) {
		String normalized = TableSessionService.normalizeTableCode(tableCode);
		if (normalized == null) {
			throw ApiException.badRequest("TABLE_CODE_INVALID", "Table code must match format T01.");
		}
		RestaurantTableEntity table = tableRepository.findByTableCodeAndActiveTrue(normalized)
				.orElseThrow(() -> ApiException.notFound("TABLE_NOT_FOUND", "Active table was not found."));
		return new TableResponse(table.getTableCode(), table.getDisplayName(), table.isActive());
	}

	/**
	 * Phân giải mã QR trên bàn thành bàn nào (#97).
	 *
	 * <p>Đây là bước ĐẦU TIÊN của khách: quét QR, frontend gọi endpoint này lấy {@code tableCode}
	 * rồi mới mở phiên bàn. Thiếu nó thì mọi luồng gọi món tại chỗ đứng ngay từ bước một.
	 *
	 * <p>Không đăng nhập, và cũng không thể đăng nhập — khách chưa có tài khoản gì. Thứ gác ở đây
	 * là bản thân mã QR: nó dài, ngẫu nhiên, và {@link TableQrTokenRotator} đổi nó sau mỗi phiên.
	 *
	 * <p>Chỉ trả {@code tableCode} và {@code displayName}, đúng {@code TableQrResponse} của bản
	 * .NET — KHÔNG trả lại chính mã QR hay {@code id} nội bộ, vì phản hồi này đi tới một thiết bị
	 * chưa xác thực nào đó.
	 */
	@GetMapping("/api/tables/qr/{qrToken}")
	public TableDtos.TableQrResponse resolveQr(@PathVariable String qrToken) {
		String normalized = qrToken == null || qrToken.isBlank() ? null : qrToken.trim();
		if (normalized == null) {
			throw ApiException.badRequest("QR_TOKEN_INVALID", "QR token is required.");
		}
		RestaurantTableEntity table = tableRepository.findByQrTokenAndActiveTrue(normalized)
				.orElseThrow(() -> ApiException.notFound(
						"QR_NOT_FOUND", "QR token does not match an active table."));
		return new TableDtos.TableQrResponse(table.getTableCode(), table.getDisplayName());
	}

	@PostMapping("/api/table-sessions")
	public OpenTableSessionResponse openTableSession(@RequestBody OpenTableSessionRequest request) {
		return sessionService.openOrResumeSession(request);
	}

	@GetMapping("/api/table-sessions/{sessionId}")
	public OpenTableSessionResponse getTableSession(
			@PathVariable String sessionId, HttpServletRequest request) {
		String token = request.getHeader("X-Table-Session-Token");
		if (token == null || token.isBlank()) {
			throw new ApiException(
					org.springframework.http.HttpStatus.UNAUTHORIZED,
					"TABLE_SESSION_TOKEN_INVALID", "A valid table session token is required.");
		}
		return sessionService.getSessionForResume(sessionId, token);
	}

	@PostMapping("/api/table-sessions/{sessionId}/close")
	@PreAuthorize("hasAnyRole('Staff', 'Admin')")
	public TableSessionResponse closeTableSession(@PathVariable String sessionId) {
		return sessionService.closeSession(sessionId);
	}

	@GetMapping("/api/table-sessions/{sessionId}/invoice")
	public TableInvoiceDtos.InvoiceResponse getInvoice(
			@PathVariable String sessionId, HttpServletRequest request) {
		return invoiceService.getInvoice(sessionId, request.getHeader("X-Table-Session-Token"));
	}

	@GetMapping("/api/table-sessions/{sessionId}/orders")
	public com.cmc.restaurant.orders.application.OrderDtos.OrderListResponse listSessionOrders(
			@PathVariable String sessionId, HttpServletRequest request) {
		return activityService.listOrders(sessionId, request.getHeader("X-Table-Session-Token"));
	}

	@PostMapping("/api/table-sessions/{sessionId}/assistance")
	public TableDtos.TableAssistanceResponse requestAssistance(
			@PathVariable String sessionId,
			@RequestBody(required = false) TableDtos.TableAssistanceRequest body,
			HttpServletRequest request) {
		return activityService.requestAssistance(
				sessionId, body, request.getHeader("X-Table-Session-Token"));
	}
}
