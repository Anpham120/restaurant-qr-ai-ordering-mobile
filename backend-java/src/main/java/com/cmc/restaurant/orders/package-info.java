/**
 * Orders — order/order-item state machine, order rounds, table invoices. Most invariants of any
 * module (V7, V14-V19, V49); ported with a domain/application/adapter split (issues #6-#9) so the
 * state machine is testable without Hibernate. See docs/pm/KE_HOACH_HOC_KY_2026-2.md §5.3.
 */
package com.cmc.restaurant.orders;
