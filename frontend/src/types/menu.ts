export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryName: string;
  imageUrl: string;
  isAvailable: boolean;
  tags: string[];
  /** Phút từ lúc bếp nhận món tới lúc món sẵn sàng. `null` = chưa khai, không ước lượng được. */
  prepMinutes: number | null;
};

export type MenuCart = Record<string, number>;

