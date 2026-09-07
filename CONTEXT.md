# Shop Table Ordering

This context covers dine-in ordering at the shop, from QR entry through counter fulfilment and settlement of the table. Takeaway orders are taken at the counter and settled before preparation; there is no delivery channel.

## Language

**Table Session**:
The active dine-in visit opened from a table QR. It contains every order round placed before the table is settled or closed.
_Avoid_: Order session, cart session

**Order Round**:
One submission of selected items to the counter within a Table Session. A Table Session may contain many Order Rounds.
_Avoid_: Invoice, bill

**Table Invoice**:
The single settlement summary for all Order Rounds in a Table Session. Promotions, loyalty identification, and payment method belong to this invoice.
_Avoid_: Order payment, cart total

**Payment Request**:
The customer's request to settle the Table Invoice using a selected payment method.
_Avoid_: Send order, checkout order
