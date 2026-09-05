import type { AdminMenuCategory, AdminMenuItem, AdminMenuOverview } from "../types";
import { api } from "./apiClient";

export type AdminMenuItemPayload = {
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string | null;
  isAvailable: boolean;
  tags: string[];
  /**
   * Phút từ lúc bếp nhận món tới lúc món sẵn sàng.
   *
   * `null` khi SỬA nghĩa là GIỮ NGUYÊN, không phải xoá — máy chủ cố ý làm vậy để một client chưa
   * biết tới trường này không thổi bay con số bếp đã khai chỉ vì sửa cái tên.
   */
  prepMinutes: number | null;
};

function enrichMenuItem(item: AdminMenuItem): AdminMenuItem {
  return {
    ...item,
    imageUrl: item.imageUrl ?? "",
    tags: item.tags ?? [],
  };
}

export async function getAdminMenuOverview(): Promise<AdminMenuOverview> {
  const backendItems = await api.request<AdminMenuItem[]>("/admin/menu-items?includeInactiveCategories=true");
  const categoriesById = new Map<string, AdminMenuCategory>();

  backendItems.forEach((item) => {
    const existing = categoriesById.get(item.categoryId);
    categoriesById.set(item.categoryId, {
      id: item.categoryId,
      name: item.categoryName,
      isActive: existing?.isActive ?? true,
      itemCount: (existing?.itemCount ?? 0) + 1,
    });
  });

  return {
    categories: Array.from(categoriesById.values()),
    items: backendItems.map(enrichMenuItem),
  };
}

export async function setAdminMenuItemAvailability(
  itemId: string,
  isAvailable: boolean,
): Promise<AdminMenuItem> {
  return api.request<AdminMenuItem>(`/admin/menu-items/${encodeURIComponent(itemId)}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ isAvailable }),
  });
}

export async function createAdminMenuItem(payload: AdminMenuItemPayload): Promise<AdminMenuItem> {
  return api.request<AdminMenuItem>("/admin/menu-items", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminMenuItem(
  itemId: string,
  payload: AdminMenuItemPayload,
): Promise<AdminMenuItem> {
  return api.request<AdminMenuItem>(`/admin/menu-items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminMenuItem(itemId: string): Promise<void> {
  await api.request<void>(`/admin/menu-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

// Simple list without overview enrichment
export async function fetchAdminMenuItems(): Promise<AdminMenuItem[]> {
  return api.request<AdminMenuItem[]>("/admin/menu-items?includeInactiveCategories=true");
}

// Kitchen-level list (includes unavailable items; usable by Kitchen/Staff/Admin)
export async function fetchKitchenMenuItems(): Promise<AdminMenuItem[]> {
  return api.request<AdminMenuItem[]>("/kitchen/menu-items");
}

// Kitchen-level toggle (also usable by Staff/Admin)
export async function toggleMenuItemAvailability(
  itemId: string,
  isAvailable: boolean,
): Promise<AdminMenuItem> {
  return api.request<AdminMenuItem>(
    `/kitchen/menu-items/${encodeURIComponent(itemId)}/availability`,
    { method: "PATCH", body: JSON.stringify({ isAvailable }) },
  );
}
