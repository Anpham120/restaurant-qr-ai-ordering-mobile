package com.cmc.restaurant.cart;

import com.cmc.restaurant.auth.JwtProperties;
import com.cmc.restaurant.cart.domain.Cart;
import com.cmc.restaurant.cart.domain.CartLine;
import com.cmc.restaurant.menu.MenuItemEntity;
import com.cmc.restaurant.menu.MenuItemRepository;
import com.cmc.restaurant.shared.ApiException;
import com.cmc.restaurant.tables.TableInvoiceEntity;
import com.cmc.restaurant.tables.TableInvoiceRepository;
import com.cmc.restaurant.tables.TableSessionCapability;
import com.cmc.restaurant.tables.TableSessionEntity;
import com.cmc.restaurant.tables.TableSessionRepository;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Mirrors {@code CartEndpoints.cs} (.NET). Rules live in {@link Cart}; this orchestrates the
 * session check, the menu lookup and persistence. */
@Service
public class CartService {

	private final CartItemRepository cartItemRepository;
	private final MenuItemRepository menuItemRepository;
	private final TableSessionRepository tableSessionRepository;
	private final TableInvoiceRepository tableInvoiceRepository;
	private final TableSessionCapability capability;
	private final JwtProperties jwtProperties;

	public CartService(
			CartItemRepository cartItemRepository, MenuItemRepository menuItemRepository,
			TableSessionRepository tableSessionRepository, TableInvoiceRepository tableInvoiceRepository,
			TableSessionCapability capability, JwtProperties jwtProperties) {
		this.cartItemRepository = cartItemRepository;
		this.menuItemRepository = menuItemRepository;
		this.tableSessionRepository = tableSessionRepository;
		this.tableInvoiceRepository = tableInvoiceRepository;
		this.capability = capability;
		this.jwtProperties = jwtProperties;
	}

	public CartDtos.CartResponse getCart(String tableSessionId, String suppliedToken) {
		requireSession(tableSessionId, suppliedToken);
		return toResponse(tableSessionId, cartItemRepository.findByTableSessionId(tableSessionId));
	}

	@Transactional
	public CartDtos.CartResponse updateItem(
			String tableSessionId, CartDtos.UpdateCartItemRequest request, String suppliedToken) {
		requireSession(tableSessionId, suppliedToken);
		if (request == null) {
			throw ApiException.badRequest("REQUEST_INVALID", "menuItemId is required.");
		}

		// Availability is checked before the aggregate runs, and only when growing: an item taken
		// off the menu (86'd) must not block a customer from REMOVING it from their cart.
		if (request.delta() > 0 && request.menuItemId() != null && !request.menuItemId().isBlank()) {
			MenuItemEntity menuItem = menuItemRepository.findById(request.menuItemId().trim())
					.orElseThrow(() -> ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found."));
			if (!menuItem.isAvailable()) {
				throw ApiException.badRequest("MENU_ITEM_UNAVAILABLE", "Menu item is unavailable.");
			}
		}

		List<CartItemEntity> rows = cartItemRepository.findByTableSessionId(tableSessionId);
		Cart cart = new Cart(tableSessionId, rows.stream()
				.map(r -> new CartLine(r.getMenuItemId(), r.getQuantity(), r.getNote())).toList());

		Optional<CartLine> result = cart.applyDelta(
				request.menuItemId(), request.delta(), request.note(), invoiceStateOf(tableSessionId));

		OffsetDateTime now = OffsetDateTime.now();
		String menuItemId = request.menuItemId().trim();
		Optional<CartItemEntity> row = cartItemRepository
				.findByTableSessionIdAndMenuItemId(tableSessionId, menuItemId);

		if (result.isEmpty()) {
			row.ifPresent(cartItemRepository::delete);
		} else if (row.isPresent()) {
			row.get().setQuantity(result.get().quantity());
			row.get().setUpdatedAt(now);
			cartItemRepository.save(row.get());
		} else {
			cartItemRepository.save(new CartItemEntity(
					"tsc_" + UUID.randomUUID().toString().replace("-", ""), tableSessionId, menuItemId,
					result.get().quantity(), result.get().note(), now));
		}

		return toResponse(tableSessionId, cartItemRepository.findByTableSessionId(tableSessionId));
	}

	@Transactional
	public CartDtos.CartResponse clear(String tableSessionId, String suppliedToken) {
		requireSession(tableSessionId, suppliedToken);
		cartItemRepository.deleteByTableSessionId(tableSessionId);
		return toResponse(tableSessionId, List.of());
	}

	/** Called by Orders once a cart has become an order — replaces the raw {@code DELETE} statement
	 * {@code OrderService} used while this module was still on .NET. */
	@Transactional
	public void clearAfterOrderPlaced(String tableSessionId) {
		cartItemRepository.deleteByTableSessionId(tableSessionId);
	}

	// --- helpers -----------------------------------------------------------------------------

	private TableSessionEntity requireSession(String tableSessionId, String suppliedToken) {
		TableSessionEntity session = tableSessionRepository.findById(tableSessionId.trim())
				.orElseThrow(() -> ApiException.notFound("TABLE_SESSION_NOT_FOUND", "Table session was not found."));
		if (suppliedToken == null || !capability.isValid(session, suppliedToken, jwtProperties.signingKey())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED,
					"TABLE_SESSION_TOKEN_INVALID", "A valid table session token is required.");
		}
		if (!session.isActiveAt(OffsetDateTime.now())) {
			throw new ApiException(HttpStatus.GONE, "TABLE_SESSION_EXPIRED",
					"Table session has expired. Please scan QR again.");
		}
		return session;
	}

	private Cart.InvoiceState invoiceStateOf(String tableSessionId) {
		return tableInvoiceRepository.findByTableSessionId(tableSessionId)
				.map(TableInvoiceEntity::getStatus)
				.map(status -> switch (status) {
					case "Pending" -> Cart.InvoiceState.PaymentPending;
					case "Paid", "Confirmed" -> Cart.InvoiceState.Settled;
					default -> Cart.InvoiceState.None;
				})
				.orElse(Cart.InvoiceState.None);
	}

	private CartDtos.CartResponse toResponse(String tableSessionId, List<CartItemEntity> rows) {
		Map<String, MenuItemEntity> menuItems = menuItemRepository
				.findAllById(rows.stream().map(CartItemEntity::getMenuItemId).toList()).stream()
				.collect(Collectors.toMap(MenuItemEntity::getId, Function.identity()));

		List<CartDtos.CartItemResponse> items = new ArrayList<>();
		BigDecimal subtotal = BigDecimal.ZERO;
		OffsetDateTime updatedAt = null;
		for (CartItemEntity row : rows) {
			MenuItemEntity menuItem = menuItems.get(row.getMenuItemId());
			BigDecimal price = menuItem == null ? BigDecimal.ZERO : menuItem.getPrice();
			BigDecimal lineTotal = price.multiply(BigDecimal.valueOf(row.getQuantity()));
			subtotal = subtotal.add(lineTotal);
			if (updatedAt == null || row.getUpdatedAt().isAfter(updatedAt)) {
				updatedAt = row.getUpdatedAt();
			}
			items.add(new CartDtos.CartItemResponse(
					row.getId(), row.getMenuItemId(),
					menuItem == null ? "" : menuItem.getName(),
					menuItem == null ? "" : menuItem.getDescription(),
					price,
					menuItem == null ? null : menuItem.getCategoryId(), null,
					menuItem == null ? null : menuItem.getImageUrl(),
					menuItem != null && menuItem.isAvailable(),
					row.getQuantity(), row.getNote(), lineTotal, row.getUpdatedAt()));
		}
		int itemCount = rows.stream().mapToInt(CartItemEntity::getQuantity).sum();
		return new CartDtos.CartResponse(
				tableSessionId, items, itemCount, subtotal,
				updatedAt == null ? OffsetDateTime.now() : updatedAt);
	}
}
