import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { useI18n } from "@cmc/i18n";
import "./restaurant-album.css";

/* ========================================================================
   Album Data
   ======================================================================== */
const ALBUM_ITEMS = [
  {
    src: "/album-images/01-ngoai-canh-nha-hang.webp",
    alt: "Ngoại cảnh nhà hàng CMC Restaurant",
    caption: "Mặt tiền nhà hàng",
    category: "exterior",
  },
  {
    src: "/album-images/09-sanh-don-khach.webp",
    alt: "Sảnh đón khách ấm áp",
    caption: "Sảnh đón khách",
    category: "interior",
  },
  {
    src: "/album-images/02-khong-gian-tang-1.webp",
    alt: "Không gian tầng 1 rộng rãi, ngập nắng",
    caption: "Không gian tầng 1",
    category: "interior",
  },
  {
    src: "/album-images/03-goc-am-cung.webp",
    alt: "Góc ấm cúng dành cho gia đình",
    caption: "Góc gia đình",
    category: "interior",
  },
  {
    src: "/album-images/06-phong-vip.webp",
    alt: "Phòng VIP sang trọng cho tiếp khách",
    caption: "Phòng VIP",
    category: "vip",
  },
  {
    src: "/album-images/05-san-vuon.webp",
    alt: "Sân vườn xanh mát buổi tối",
    caption: "Sân vườn",
    category: "garden",
  },
  {
    src: "/album-images/04-bep-mo.webp",
    alt: "Bếp mở với đầu bếp chuyên nghiệp",
    caption: "Bếp mở",
    category: "kitchen",
  },
  {
    src: "/album-images/07-quay-bar.webp",
    alt: "Quầy bar pha chế đồ uống",
    caption: "Quầy bar",
    category: "bar",
  },
  {
    src: "/album-images/08-chi-tiet-trang-tri.webp",
    alt: "Chi tiết trang trí phong cách Việt",
    caption: "Trang trí nội thất",
    category: "decor",
  },
  {
    src: "/album-images/10-ban-cong-tang-2.webp",
    alt: "Ban công tầng 2 lãng mạn",
    caption: "Ban công tầng 2",
    category: "interior",
  },
  {
    src: "/album-images/11-ban-tiec-trang-tri.webp",
    alt: "Bàn tiệc trang trí tinh tế",
    caption: "Bàn tiệc",
    category: "decor",
  },
  {
    src: "/album-images/12-hanh-lang.webp",
    alt: "Hành lang ấm áp với gạch trần",
    caption: "Hành lang",
    category: "interior",
  },
];

const CATEGORIES = [
  { key: "all", label: "Tất cả" },
  { key: "exterior", label: "Ngoại cảnh" },
  { key: "interior", label: "Nội thất" },
  { key: "vip", label: "Phòng VIP" },
  { key: "garden", label: "Sân vườn" },
  { key: "kitchen", label: "Bếp" },
  { key: "bar", label: "Quầy bar" },
  { key: "decor", label: "Trang trí" },
];

/* ========================================================================
   Component
   ======================================================================== */
export function RestaurantAlbumPage() {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState("all");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const filteredItems =
    activeFilter === "all"
      ? ALBUM_ITEMS
      : ALBUM_ITEMS.filter((item) => item.category === activeFilter);

  const openLightbox = (idx: number) => setLightboxIdx(idx);
  const closeLightbox = () => setLightboxIdx(null);

  const goNext = useCallback(() => {
    if (lightboxIdx === null) return;
    setLightboxIdx((lightboxIdx + 1) % filteredItems.length);
  }, [lightboxIdx, filteredItems.length]);

  const goPrev = useCallback(() => {
    if (lightboxIdx === null) return;
    setLightboxIdx((lightboxIdx - 1 + filteredItems.length) % filteredItems.length);
  }, [lightboxIdx, filteredItems.length]);

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIdx === null) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [lightboxIdx, goNext, goPrev]);

  return (
    <div className="album-page">
      {/* Hero banner */}
      <section className="album-hero">
        <div className="album-hero-bg" />
        <div className="album-hero-content">
          <Link className="album-breadcrumb" to="/#khong-gian">
            <ArrowLeft aria-hidden="true" size={16} /> {t("Trang chủ")}
          </Link>
          <h1>{t("Không gian quán")}</h1>
          <p>
            {t("CMC Restaurant, nơi hội tụ tinh hoa ẩm thực Việt trong không gian ấm cúng, trang nhã.")}
          </p>
        </div>
      </section>

      {/* Album heading */}
      <section className="album-container">
        <div className="album-section-title">
          <h2>{t("Album ảnh không gian quán")}</h2>
          <p>{t("Khám phá từng góc nhỏ của CMC Restaurant qua bộ ảnh không gian bên dưới.")}</p>
        </div>

        {/* Category filters */}
        <div className="album-filters">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`album-filter-btn${activeFilter === cat.key ? " active" : ""}`}
              type="button"
              onClick={() => setActiveFilter(cat.key)}
            >
              {t(cat.label)}
            </button>
          ))}
        </div>

        {/* Gallery grid */}
        <div className="album-grid">
          {filteredItems.map((item, idx) => (
            <figure
              className="album-card"
              key={item.src}
              onClick={() => openLightbox(idx)}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openLightbox(idx)}
              role="button"
              aria-label={t("Xem ảnh: {caption}", { caption: t(item.caption) })}
            >
              <div className="album-card-img">
                <img src={item.src} alt={t(item.alt)} loading="lazy" />
                <div className="album-card-overlay">
                  <ZoomIn aria-hidden="true" size={32} />
                </div>
              </div>
              <figcaption>{t(item.caption)}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIdx !== null && createPortal(
        <div className="album-lightbox" onClick={closeLightbox} role="dialog" aria-modal="true" aria-label={t("Xem ảnh phóng to")}>
          <button className="album-lightbox-close" onClick={closeLightbox} aria-label={t("Đóng")} type="button">
            <X aria-hidden="true" size={20} />
          </button>
          <button className="album-lightbox-nav prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label={t("Ảnh trước")} type="button">
            <ChevronLeft aria-hidden="true" size={24} />
          </button>
          <div className="album-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={filteredItems[lightboxIdx].src} alt={t(filteredItems[lightboxIdx].alt)} />
            <p className="album-lightbox-caption">
              {t(filteredItems[lightboxIdx].caption)}
              <span> - {lightboxIdx + 1}/{filteredItems.length}</span>
            </p>
          </div>
          <button className="album-lightbox-nav next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label={t("Ảnh tiếp")} type="button">
            <ChevronRight aria-hidden="true" size={24} />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
