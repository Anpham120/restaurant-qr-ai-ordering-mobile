import { formatVnd as formatBrandVnd } from "@cmc/brand-ui";
import { useI18n } from "@cmc/i18n";
import { localizeMenuItem, localizeMenuTag } from "@cmc/i18n/menu";
import type { MenuItem } from "../../types";

type MenuItemCardProps = {
  item: MenuItem;
  quantity?: number;
  onAdd?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
  readOnly?: boolean;
};

export function formatVnd(price: number) {
  return formatBrandVnd(price);
}

/** Nhãn hiển thị tiếng Việt cho nhãn thực đơn.
 *
 * Sinh từ data/menu-tags.json — nguồn sự thật duy nhất, dùng chung với
 * dịch vụ AI. Trước đây từ điển này chỉ tồn tại ở tệp này, nên giao diện hiển thị
 * đúng "Tối" trong khi AI đoán nhãn `toi` là "tỏi" và trả 36 món ăn buổi tối cho
 * câu hỏi về tỏi.
 *
 * Nhận cả khóa mới (`meal:dinner`) và tên cũ (`toi`) vì hai nguồn đang cùng chạy:
 * /api/menu trả nhãn cũ từ cơ sở dữ liệu, thực đơn JSON và AI dùng khóa mới.
 *
 * Cập nhật bằng: python ai/tools/build_tag_dictionary.py
 */
const TAG_LABELS: Record<string, string> = {
  // allergen
  "allergen:dairy": "Có sữa",
  "allergen:egg": "Có trứng",
  "allergen:gluten": "Có gluten",
  "allergen:peanut": "Có đậu phộng",
  "allergen:seafood": "Có hải sản",
  // audience
  "audience:child": "Trẻ em",
  "audience:elderly": "Người già",
  // diet
  "diet:vegan": "Vegan",
  "diet:vegetarian": "Chay",
  // flavour
  "flavour:fatty": "Béo",
  "flavour:rich": "Đậm đà",
  "flavour:salty": "Mặn",
  "flavour:smoky": "Thơm khói",
  "flavour:sour": "Chua",
  "flavour:sweet": "Ngọt",
  // health
  "health:healthy": "Healthy",
  "health:high_protein": "Giàu protein",
  "health:light": "Thanh nhẹ",
  "health:low_calorie": "Ít calo",
  "health:low_fat": "Ít dầu mỡ",
  "health:no_msg": "Không MSG",
  // ingredient
  "ingredient:beef": "Bò",
  "ingredient:chicken": "Gà",
  "ingredient:crab": "Cua",
  "ingredient:fish": "Cá",
  "ingredient:mushroom": "Nấm",
  "ingredient:pork": "Heo",
  "ingredient:shrimp": "Tôm",
  "ingredient:squid": "Mực",
  "ingredient:tofu": "Đậu hũ",
  "ingredient:vegetable": "Rau",
  // meal
  "meal:breakfast": "Sáng",
  "meal:dinner": "Tối",
  "meal:late_night": "Ăn khuya",
  "meal:lunch": "Trưa",
  // method
  "method:boiled": "Luộc",
  "method:braised": "Kho",
  "method:fried": "Chiên",
  "method:grilled": "Nướng",
  "method:roasted": "Rang",
  "method:whole_roast": "Quay",
  "method:rolled": "Cuốn",
  "method:simmered": "Nấu",
  "method:steamed": "Hấp",
  "method:stewed": "Tiềm",
  "method:stir_fried": "Xào",
  // occasion
  "occasion:banquet": "Tiệc",
  "occasion:birthday": "Sinh nhật",
  "occasion:business": "Tiếp khách",
  "occasion:date": "Hẹn hò",
  "occasion:drinking": "Nhậu",
  "occasion:everyday": "Hàng ngày",
  // party
  "party:family": "Gia đình",
  "party:friends": "Nhóm bạn",
  "party:share": "Chia sẻ",
  "party:solo": "Cá nhân",
  "party:three_five": "3-5 người",
  "party:two_three": "2-3 người",
  // price
  "price:budget": "Bình dân",
  "price:high": "Cao cấp",
  "price:mid": "Tầm trung",
  "price:premium": "Premium",
  // promo
  "promo:popular": "Phổ biến",
  "promo:signature": "Đặc trưng",
  // region
  "region:central": "Miền Trung",
  "region:danang": "Đà Nẵng",
  "region:hanoi": "Hà Nội",
  "region:highlands": "Tây Nguyên",
  "region:hoian": "Hội An",
  "region:hue": "Huế",
  "region:mekong": "Miền Tây",
  "region:north": "Miền Bắc",
  "region:saigon": "Sài Gòn",
  "region:south": "Miền Nam",
  // season
  "season:all_year": "Quanh năm",
  "season:cold_season": "Mùa lạnh",
  "season:cooling": "Giải nhiệt",
  "season:hot_season": "Mùa nóng",
  // serving
  "serving:hot": "Nóng",
  "serving:preorder": "Đặt trước",
  "serving:takeaway": "Mang đi",
  // spice
  "spice:hot": "Cay đậm",
  "spice:medium": "Cay vừa",
  "spice:mild": "Cay nhẹ",
  "spice:none": "Không cay",

  // Tên nhãn cũ do /api/menu (cơ sở dữ liệu) vẫn trả về — giữ để không mất nhãn hiển thị
  "2-3 nguoi": "2-3 người",
  "3-5 nguoi": "3-5 người",
  "Da Nang": "Đà Nẵng",
  "Ha Noi": "Hà Nội",
  "Hoi An": "Hội An",
  "Hue": "Huế",
  "Sai Gon": "Sài Gòn",
  "Tay Nguyen": "Tây Nguyên",
  "an khuya": "Ăn khuya",
  "beo": "Béo",
  "binh dan": "Bình dân",
  "bo": "Bò",
  "ca": "Cá",
  "ca nhan": "Cá nhân",
  "cao cap": "Cao cấp",
  "cay dam": "Cay đậm",
  "cay nhe": "Cay nhẹ",
  "cay vua": "Cay vừa",
  "chay": "Chay",
  "chien": "Chiên",
  "chua": "Chua",
  "co dau phong": "Có đậu phộng",
  "co gluten": "Có gluten",
  "co hai san": "Có hải sản",
  "co sua": "Có sữa",
  "co trung": "Có trứng",
  "cua": "Cua",
  "cuon": "Cuốn",
  "dam da": "Đậm đà",
  "dat truoc": "Đặt trước",
  "dau hu": "Đậu hũ",
  "ga": "Gà",
  "gia dinh": "Gia đình",
  "giai nhiet": "Giải nhiệt",
  "giau protein": "Giàu protein",
  "hang ngay": "Hàng ngày",
  "hap": "Hấp",
  "healthy": "Healthy",
  "hen ho": "Hẹn hò",
  "heo": "Heo",
  "it calo": "Ít calo",
  "it dau mo": "Ít dầu mỡ",
  "kho": "Kho",
  "khong MSG": "Không MSG",
  "khong cay": "Không cay",
  "luoc": "Luộc",
  "man": "Mặn",
  "mang di": "Mang đi",
  "mien Bac": "Miền Bắc",
  "mien Nam": "Miền Nam",
  "mien Tay": "Miền Tây",
  "mien Trung": "Miền Trung",
  "mua lanh": "Mùa lạnh",
  "mua nong": "Mùa nóng",
  "muc": "Mực",
  "nam": "Nấm",
  "nau": "Nấu",
  "ngot": "Ngọt",
  "nguoi gia": "Người già",
  "nhau": "Nhậu",
  "nhom ban": "Nhóm bạn",
  "nong": "Nóng",
  "nuong": "Nướng",
  "pho bien": "Phổ biến",
  "premium": "Premium",
  "quanh nam": "Quanh năm",
  "rang": "Rang",
  "quay": "Quay",
  "rau": "Rau",
  "sang": "Sáng",
  "share": "Chia sẻ",
  "signature": "Đặc trưng",
  "sinh nhat": "Sinh nhật",
  "tam trung": "Tầm trung",
  "thanh nhe": "Thanh nhẹ",
  "thom khoi": "Thơm khói",
  "tiec": "Tiệc",
  "tiem": "Tiềm",
  "tiep khach": "Tiếp khách",
  "toi": "Tối",
  "tom": "Tôm",
  "tre em": "Trẻ em",
  "trua": "Trưa",
  "vegan": "Vegan",
  "xao": "Xào",
};

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] || tag;
}

export function MenuItemCard({
  item,
  quantity,
  onAdd,
  onRemove,
  readOnly = false,
}: MenuItemCardProps) {
  const { formatMoney, locale, t } = useI18n();
  const displayItem = localizeMenuItem(item, locale);
  const formattedPrice = formatMoney(item.price);

  return (
    <article className={item.isAvailable ? "cmc-menu-card" : "cmc-menu-card disabled"}>
      <div className="cmc-card-image-wrap">
        <img alt={displayItem.name} className="cmc-card-image" src={item.imageUrl} />
        <span className={item.isAvailable ? "cmc-availability ready" : "cmc-availability muted"}>
          {item.isAvailable ? t("Còn món") : t("Tạm hết")}
        </span>
      </div>
      <div className="cmc-card-content">
        <div>
          <p className="cmc-card-category">{displayItem.categoryName}</p>
          <h3>{displayItem.name}</h3>
          <p>{displayItem.description}</p>
        </div>
        <div className="cmc-tag-row">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{localizeMenuTag(tag, locale, tagLabel(tag))}</span>
          ))}
        </div>
        <div className="cmc-card-footer">
          <strong className="cmc-card-price" data-money aria-label={t("Giá {price}", { price: formattedPrice })}>
            <span className="cmc-card-price-value" aria-hidden="true">{formattedPrice}</span>
          </strong>
          {readOnly ? null : quantity && quantity > 0 ? (
            <div className="cmc-stepper anim-scale-in" aria-label={t("Số lượng {item}", { item: displayItem.name })}>
              <button onClick={() => onRemove?.(item.id)} type="button">
                -
              </button>
              <span>{quantity}</span>
              <button disabled={!item.isAvailable} onClick={() => onAdd?.(item.id)} type="button">
                +
              </button>
            </div>
          ) : (
            <button
              className="cmc-add-button"
              disabled={!item.isAvailable}
              onClick={() => onAdd?.(item.id)}
              type="button"
            >
              <span className="cmc-add-button-icon" aria-hidden="true">+</span>
              <span>{t("Thêm")}</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
