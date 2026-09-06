import type { OrderStatus, TableCode } from "./api";
import type { MenuItem } from "./menu";
import type { CustomerOrderType, DeliveryDetails, OrderItemStatus, PaymentStatus } from "./order";

export type AdminMenuCategory = {
  id: string;
  name: string;
  isActive: boolean;
  itemCount: number;
};

export type AdminMenuItem = MenuItem & {
  categoryId: string;
};

export type AdminMenuOverview = {
  categories: AdminMenuCategory[];
  items: AdminMenuItem[];
};

export type AdminOrderType = CustomerOrderType;

export type AdminOrderItem = {
  id: string;
  name: string;
  quantity: number;
  note?: string;
  status: OrderItemStatus;
};

export type AdminOrder = {
  id: string;
  code: string;
  type: AdminOrderType;
  tableCode?: TableCode;
  customerName: string;
  status: OrderStatus;
  total: number;
  deliveryDetails?: DeliveryDetails | null;
  deliveryFee?: number | null;
  fulfillmentStatus?: string | null;
  placedAt: string;
  paymentStatus: PaymentStatus;
  items: AdminOrderItem[];
};
