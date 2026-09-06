import type { CartLine, Contact, Option, Product } from './types';

export const money = (amount: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
export const selectedOptions = (product: Product, ids: string[]): Option[] =>
  product.optionGroups
    .flatMap((group) => group.options)
    .filter((option) => ids.includes(option.id));
export const unitPrice = (line: Pick<CartLine, 'product' | 'optionIds'>) =>
  line.product.price +
  selectedOptions(line.product, line.optionIds).reduce((sum, option) => sum + option.price, 0);
export const cartTotal = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + unitPrice(line) * line.quantity, 0);
export const configurationKey = (id: string, options: string[], note: string) =>
  JSON.stringify([id, [...options].sort(), note.trim()]);
export function addToCart(
  lines: CartLine[],
  product: Product,
  optionIds: string[],
  quantity: number,
  note: string,
): CartLine[] {
  const key = configurationKey(product.id, optionIds, note);
  const existing = lines.find((line) => line.key === key);
  return existing
    ? lines.map((line) =>
        line.key === key ? { ...line, quantity: Math.min(99, line.quantity + quantity) } : line,
      )
    : [...lines, { key, product, optionIds, quantity, note: note.trim() }];
}
export function selectionError(product: Product, ids: string[]): string | null {
  if (!product.isAvailable) return 'Món này hiện đã hết. Vui lòng chọn món khác.';
  const all = product.optionGroups.flatMap((group) => group.options);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !all.some((option) => option.id === id && option.isAvailable))
  )
    return 'Một lựa chọn đã hết. Vui lòng chọn lại.';
  for (const group of product.optionGroups) {
    const count = group.options.filter((option) => ids.includes(option.id)).length;
    if (count < group.minSelections)
      return `Vui lòng chọn ít nhất ${group.minSelections} lựa chọn cho ${group.name.toLowerCase()}.`;
    if (count > group.maxSelections)
      return `${group.name}: chỉ chọn tối đa ${group.maxSelections}.`;
  }
  return null;
}
export function contactErrors(
  contact: Contact,
  type: 'Delivery' | 'Pickup',
): Partial<Record<keyof Contact, string>> {
  const errors: Partial<Record<keyof Contact, string>> = {};
  if (!contact.recipientName.trim()) errors.recipientName = 'Nhập tên người nhận.';
  if (!/^(?:0\d{9}|\+84\d{9})$/.test(contact.phoneNumber.replace(/[\s.-]/g, '')))
    errors.phoneNumber = 'Nhập số điện thoại Việt Nam gồm 10 số hoặc +84.';
  if (type === 'Delivery' && contact.address.trim().length < 8)
    errors.address = 'Nhập số nhà, đường và phường/xã để giao hàng.';
  return errors;
}
const labels: Record<string, string> = {
  Draft: 'Đơn nháp',
  Placed: 'Chờ quán xác nhận',
  NotRequested: 'Chờ chọn thanh toán',
  Unselected: 'Chưa chọn',
  PendingConfirmation: 'Chờ xác nhận thanh toán',
  Pending: 'Chờ xác nhận',
  Confirmed: 'Quán đã nhận',
  Preparing: 'Đang chuẩn bị',
  Ready: 'Sẵn sàng nhận',
  Served: 'Đã bàn giao',
  Completed: 'Hoàn thành',
  Cancelled: 'Đã huỷ',
  Paid: 'Đã thanh toán',
  Unpaid: 'Chưa thanh toán',
  PendingPayment: 'Chờ thanh toán',
  Assigned: 'Đã phân công',
  Unassigned: 'Chờ phân công',
  OutForDelivery: 'Đang giao',
  Delivered: 'Đã giao',
  Failed: 'Giao chưa thành công',
  Refunded: 'Đã hoàn tiền',
  Cash: 'Tiền mặt',
  COD: 'Tiền mặt',
  VietQR: 'Chuyển khoản',
};
export const statusLabel = (value?: string | null) =>
  value ? (labels[value] ?? value) : 'Chờ cập nhật';
export const isPaid = (value?: string | null) => value === 'Paid' || value === 'Confirmed';
export const paymentLabel = (value?: string | null) =>
  isPaid(value)
    ? 'Đã thanh toán'
    : value === 'Pending'
      ? 'Chờ thanh toán'
      : value === 'Failed'
        ? 'Thanh toán chưa thành công'
        : statusLabel(value);
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thực hiện được. Vui lòng thử lại.';
export function apiUrl(input: string): string {
  const url = new URL(input.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    throw new Error('Nhập địa chỉ máy chủ, ví dụ https://api.quan.vn, không thêm /api.');
  return url.origin;
}
export const requestKey = () =>
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
