export type Option = { id: string; name: string; price: number; isAvailable: boolean };
export type OptionGroup = {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: Option[];
};
export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  categoryName: string;
  imageUrl?: string | null;
  isAvailable: boolean;
  tags: string[];
  prepMinutes: number;
  optionGroups: OptionGroup[];
};
export type Menu = { categories: { categoryId: string; name: string }[]; items: Product[] };
export type ShopConfig = {
  name: string;
  address: string;
  phone: string;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutesLow: number;
  estimatedMinutesHigh: number;
  latitude?: number | null;
  longitude?: number | null;
  shippingFreeRadiusKm: number;
  shippingPerKm: number;
  allowCod: boolean;
};
export type CartLine = {
  key: string;
  product: Product;
  optionIds: string[];
  quantity: number;
  note: string;
};
export type Contact = {
  recipientName: string;
  phoneNumber: string;
  address: string;
  note: string;
  latitude?: number;
  longitude?: number;
};
export type Quote = { distanceKm: number; deliveryFee: number };
export type Session = {
  accessToken: string;
  expiresAt: string;
  user: { userId: string; fullName: string; email: string; role: string };
};
export type Order = {
  orderId: string;
  orderCode: string;
  customerAccessToken?: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  subtotalAmount: number;
  discountAmount: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryDetails?: Contact | null;
  fulfillmentStatus?: string | null;
  createdAt?: string;
  codAccepted?: boolean;
  items: {
    orderItemId?: string;
    name?: string;
    menuItemName?: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
    note?: string;
  }[];
  events?: { status?: string; type?: string; message?: string; createdAt?: string }[];
};
export type OrderReference = { orderCode: string; token: string; createdAt: string; paymentMethod?: 'VietQR' | 'COD' };
export type Payment = {
  payment?: { status?: string; method?: string };
  vietQr?: {
    qrImageDataUri?: string;
    quickLink?: string;
    transferContent: string;
    accountNumber: string;
    bankId: string;
    amount: number;
  } | null;
};
export type CreateOrder = {
  orderType: 'Delivery' | 'Pickup';
  expectedTotalAmount: number;
  deliveryDetails: Contact;
  items: { menuItemId: string; quantity: number; optionIds: string[]; note: string }[];
};
