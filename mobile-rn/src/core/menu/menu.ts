export interface MenuCategory {
  readonly categoryId: string;
  readonly name: string;
}

export interface MenuItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly price: number;
  readonly categoryId: string;
  readonly categoryName: string;
  /** Đường dẫn TƯƠNG ĐỐI như `/menu-images/04-banh-cuon-thanh-tri.webp` — xem `urlAnh`. */
  readonly imageUrl: string | null;
  readonly isAvailable: boolean;
  readonly tags: readonly string[];
}

export function menuCategoryTuJson(json: unknown): MenuCategory {
  const o = json as Record<string, unknown>;
  return { categoryId: o.categoryId as string, name: o.name as string };
}

export function menuItemTuJson(json: unknown): MenuItem {
  const o = json as Record<string, unknown>;
  return {
    id: o.id as string,
    name: o.name as string,
    description: typeof o.description === 'string' ? o.description : null,
    price: o.price as number,
    categoryId: typeof o.categoryId === 'string' ? o.categoryId : '',
    categoryName: typeof o.categoryName === 'string' ? o.categoryName : '',
    imageUrl: typeof o.imageUrl === 'string' ? o.imageUrl : null,
    isAvailable: typeof o.isAvailable === 'boolean' ? o.isAvailable : true,
    tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
  };
}

/** Một danh mục kèm các món thuộc nó. */
export interface NhomMon {
  readonly tenDanhMuc: string;
  readonly mon: readonly MenuItem[];
}

/**
 * Nhóm món theo danh mục để hiện thành từng khối.
 *
 * `GET /api/menu` trả hai danh sách PHẲNG và tách rời (`categories`, `items`), không lồng nhau —
 * nên việc nhóm là của client.
 *
 * Ba luật, mỗi luật đều có phép kiểm:
 *
 * - **Giữ nguyên thứ tự danh mục do máy chủ trả về.** Đó là thứ tự quán muốn thực đơn hiện ra
 *   (khai vị trước, tráng miệng sau), không phải thứ tự bảng chữ cái.
 * - **Bỏ danh mục rỗng.** Một tiêu đề không có món nào bên dưới trông như lỗi tải.
 * - **KHÔNG đánh rơi món mồ côi.** Món có `categoryId` không khớp danh mục nào vẫn phải hiện ra,
 *   gom vào một khối cuối. Lặng lẽ bỏ đi nghĩa là một món có thật biến mất khỏi thực đơn vì một
 *   lỗi dữ liệu ở chỗ khác — và không ai thấy gì để mà sửa.
 */
export function nhomTheoDanhMuc(
  danhMuc: readonly MenuCategory[],
  mon: readonly MenuItem[],
): NhomMon[] {
  // `Map` chứ không phải object thường: khoá đến từ dữ liệu máy chủ, và một `categoryId` tên
  // `__proto__` hay `constructor` sẽ đụng vào prototype của object thường. Món đó biến mất khỏi
  // thực đơn, hoặc tệ hơn là kéo theo cả nhóm khác.
  const theoId = new Map<string, MenuItem[]>();
  for (const m of mon) {
    const ds = theoId.get(m.categoryId);
    if (ds === undefined) theoId.set(m.categoryId, [m]);
    else ds.push(m);
  }

  const ketQua: NhomMon[] = [];
  const daDung = new Set<string>();
  for (const c of danhMuc) {
    const ds = theoId.get(c.categoryId);
    if (ds === undefined || ds.length === 0) continue;
    daDung.add(c.categoryId);
    ketQua.push({ tenDanhMuc: c.name, mon: ds });
  }

  const moCoi: MenuItem[] = [];
  for (const [id, ds] of theoId) {
    if (!daDung.has(id)) moCoi.push(...ds);
  }
  if (moCoi.length > 0) {
    ketQua.push({ tenDanhMuc: 'Món khác', mon: moCoi });
  }
  return ketQua;
}

/**
 * Địa chỉ đầy đủ của ảnh món.
 *
 * Ảnh KHÔNG do API phục vụ. Đo trên hệ thống đang chạy:
 *
 *     GET :8081/menu-images/04-banh-cuon-thanh-tri.webp  → 401   (API)
 *     GET :8080/menu-images/04-banh-cuon-thanh-tri.webp  → 200   (web)
 *
 * Nên app cần một base URL RIÊNG cho ảnh. Ghép nhầm vào base của API thì mọi ảnh im lặng hỏng và
 * thực đơn hiện ra trống trơn mà không có lỗi nào để lần theo.
 *
 * Đường dẫn tuyệt đối được giữ nguyên: nếu một ngày ảnh chuyển sang CDN, `imageUrl` sẽ là URL đầy
 * đủ và hàm này không được phép ghép thêm gì vào trước.
 */
export function urlAnh(imageUrl: string | null, imageBaseUrl: string): string | null {
  const duongDan = imageUrl?.trim() ?? '';
  if (duongDan.length === 0) return null;
  if (duongDan.startsWith('http://') || duongDan.startsWith('https://')) {
    return duongDan;
  }
  const base = imageBaseUrl.endsWith('/') ? imageBaseUrl.slice(0, -1) : imageBaseUrl;
  return duongDan.startsWith('/') ? `${base}${duongDan}` : `${base}/${duongDan}`;
}

/**
 * Bỏ dấu tiếng Việt để so khớp khi tìm món.
 *
 * Bàn phím điện thoại thường không bật bộ gõ tiếng Việt, và khách gõ một tay khi đang ngồi ăn.
 * Bắt gõ đúng dấu làm ô tìm kiếm vô dụng đúng lúc nó cần chạy: gõ "pho" phải ra "Phở bò".
 *
 * Dùng `normalize('NFD')` rồi cắt dải dấu kết hợp — gọn hơn hẳn bảy biểu thức thay thế của bản
 * Flutter, và phủ luôn những dấu chưa liệt kê.
 *
 * `đ` vẫn phải xử lý RIÊNG vì NFD **không** tách nó: `đ` là ký tự Latin độc lập (U+0111), không
 * phải `d` cộng dấu. Thiếu dòng đó thì gõ "dau hu" không tìm ra "Đậu hũ".
 *
 * Dải dấu viết dạng `\u0300-\u036f` chứ KHÔNG dán ký tự dấu thô vào mã nguồn. Dấu kết hợp không
 * hiện thành hình gì trong trình soạn thảo, nên một lần sao chép hụt sẽ đổi hành vi hàm này mà
 * diff trông y hệt cũ.
 */
function boDau(text: string): string {
  return text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Lọc món theo từ khoá. Từ khoá rỗng trả nguyên danh sách.
 *
 * GIỮ NGUYÊN thứ tự đầu vào — thứ tự đó là thứ tự quán muốn thực đơn hiện ra.
 */
export function locMonTheoTen(mon: readonly MenuItem[], tuKhoa: string): readonly MenuItem[] {
  const khoa = boDau(tuKhoa);
  if (khoa.length === 0) return mon;
  return mon.filter((m) => boDau(m.name).includes(khoa));
}
