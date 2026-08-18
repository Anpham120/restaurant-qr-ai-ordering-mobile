package com.cmc.restaurant.cart.domain;

/** One line of the server-side cart: a menu item and how many of it. */
public record CartLine(String menuItemId, int quantity, String note) {

	CartLine withQuantity(int newQuantity) {
		return new CartLine(menuItemId, newQuantity, note);
	}
}
