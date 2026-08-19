package com.cmc.restaurant.tables;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.orders.application.OrderDtos;
import com.cmc.restaurant.orders.application.OrderService;
import com.cmc.restaurant.realtime.OrderRealtimeNotifier;
import com.cmc.restaurant.realtime.RealtimeDtos;
import com.cmc.restaurant.shared.ApiException;
import java.time.OffsetDateTime;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hai thao tác khách làm trong một phiên bàn đang mở (#96): xem lại các đơn đã gọi, và bấm gọi
 * nhân viên.
 *
 * <p>Cả hai đều xác thực bằng token năng lực của phiên bàn, không bằng JWT — khách quét QR không
 * có tài khoản.
 */
@Service
public class TableSessionActivityService {

	/** Hoá đơn đã thanh toán xong — hai trạng thái này bản .NET coi là "đã tất toán". */
	private static final Set<String> SETTLED = Set.of("Confirmed", "Paid");

	private static final String DEFAULT_ASSISTANCE_NOTE = "Yêu cầu gọi nhân viên";

	private final TableSessionRepository sessionRepository;
	private final TableInvoiceRepository invoiceRepository;
	private final RestaurantTableRepository tableRepository;
	private final TableSessionCapability capability;
	private final JwtProperties jwtProperties;
	private final OrderService orderService;
	private final OrderRealtimeNotifier realtimeNotifier;

	public TableSessionActivityService(
			TableSessionRepository sessionRepository, TableInvoiceRepository invoiceRepository,
			RestaurantTableRepository tableRepository, TableSessionCapability capability,
			JwtProperties jwtProperties, OrderService orderService,
			OrderRealtimeNotifier realtimeNotifier) {
		this.sessionRepository = sessionRepository;
		this.invoiceRepository = invoiceRepository;
		this.tableRepository = tableRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
		this.orderService = orderService;
		this.realtimeNotifier = realtimeNotifier;
	}

	/**
	 * Đơn của phiên, mới nhất trước.
	 *
	 * <p>Luật dễ bỏ sót: phiên đã đóng hoặc hết hạn vẫn ĐỌC ĐƯỢC nếu có hoá đơn đã tất toán. Khách
	 * trả tiền xong thì phiên đóng lại ngay, nhưng họ vẫn cần xem lại hoá đơn trên điện thoại. Chặn
	 * hết ở đây sẽ khoá khách khỏi chính bữa ăn họ vừa trả tiền.
	 */
	@Transactional
	public OrderDtos.OrderListResponse listOrders(String sessionId, String suppliedToken) {
		TableSessionEntity session = authenticate(sessionId, suppliedToken);

		OffsetDateTime now = OffsetDateTime.now();
		if (!session.isActiveAt(now)) {
			if (session.expireIfPast(now)) {
				sessionRepository.save(session);
			}
			if (!hasSettledInvoice(sessionId)) {
				throw new ApiException(HttpStatus.GONE, "TABLE_SESSION_INACTIVE",
						"Table session is closed or expired. Please scan QR again.");
			}
		}

		return orderService.listOrdersForTableSession(sessionId);
	}

	/** Gọi nhân viên. Chỉ phiên ĐANG hoạt động — không có ngoại lệ "đã tất toán" như trên. */
	@Transactional
	public TableDtos.TableAssistanceResponse requestAssistance(
			String sessionId, TableDtos.TableAssistanceRequest request, String suppliedToken) {
		TableSessionEntity session = authenticate(sessionId, suppliedToken);

		OffsetDateTime now = OffsetDateTime.now();
		if (!session.isActiveAt(now)) {
			if (session.expireIfPast(now)) {
				sessionRepository.save(session);
			}
			throw new ApiException(HttpStatus.GONE, "TABLE_SESSION_INACTIVE",
					"Table session is closed or expired. Please scan QR again.");
		}

		String tableCode = tableRepository.findById(session.getRestaurantTableId())
				.map(RestaurantTableEntity::getTableCode)
				.orElse("unknown");
		String note = request == null || request.note() == null || request.note().isBlank()
				? DEFAULT_ASSISTANCE_NOTE
				: request.note().trim();

		realtimeNotifier.assistanceRequested(
				new RealtimeDtos.AssistanceRequestedEvent(tableCode, sessionId, note, now));

		return new TableDtos.TableAssistanceResponse(true, tableCode);
	}

	// --- helper ---------------------------------------------------------------------------------

	/**
	 * Thứ tự ba bước lấy đúng từ bản .NET, và thứ tự đó có nghĩa:
	 *
	 * <ol>
	 *   <li>KHÔNG có header token → 401, <b>trước khi</b> tra cơ sở dữ liệu. Tra trước rồi mới đòi
	 *       token sẽ biến endpoint này thành máy dò: kẻ không có token vẫn phân biệt được phiên nào
	 *       tồn tại (404) với phiên nào không (404 khác thông điệp) — hoặc tệ hơn, 404 với 401.</li>
	 *   <li>Không tìm thấy phiên → 404.</li>
	 *   <li>Token sai → 401.</li>
	 * </ol>
	 */
	private TableSessionEntity authenticate(String sessionId, String suppliedToken) {
		if (suppliedToken == null || suppliedToken.isBlank()) {
			throw unauthorized();
		}
		TableSessionEntity session = sessionRepository.findById(sessionId.trim())
				.orElseThrow(() -> ApiException.notFound(
						"TABLE_SESSION_NOT_FOUND", "Table session was not found."));
		if (!capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw unauthorized();
		}
		return session;
	}

	private static ApiException unauthorized() {
		return new ApiException(HttpStatus.UNAUTHORIZED, "TABLE_SESSION_TOKEN_INVALID",
				"A valid table session token is required.");
	}

	private boolean hasSettledInvoice(String sessionId) {
		return invoiceRepository.findByTableSessionId(sessionId)
				.map(invoice -> SETTLED.contains(invoice.getStatus()))
				.orElse(false);
	}
}
