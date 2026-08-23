import { api } from "./apiClient";

/**
 * Độ trễ do bếp tự khai (#142).
 *
 * `minutesLeft` là phần quan trọng nhất của kiểu này: cờ tự tắt sau 90 phút, nên bảng bếp phải
 * hiện được còn bao lâu. Không hiện thì người trực ca không biết mình đang bật hay đã hết hạn, và
 * cái nút trở thành thứ họ bấm cho yên tâm chứ không phải thứ họ dùng.
 */
export type KitchenDelay = {
  delayMinutes: number;
  minutesLeft: number;
  updatedBy: string | null;
};

export async function getKitchenDelay(): Promise<KitchenDelay> {
  return api.request<KitchenDelay>("/kitchen/delay");
}

/** Truyền 0 để tắt. Backend chặn số âm và số quá 60 phút. */
export async function setKitchenDelay(delayMinutes: number): Promise<KitchenDelay> {
  return api.request<KitchenDelay>("/kitchen/delay", {
    method: "PUT",
    body: JSON.stringify({ delayMinutes }),
  });
}
