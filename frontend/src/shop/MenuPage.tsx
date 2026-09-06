import { useDeferredValue, useState } from "react";
import { ArrowRight, Check, Coffee, Cookie, Heart, IceCreamBowl, Leaf, Plus, Search, ShoppingBag, SlidersHorizontal, Soup, Truck, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useShop } from "./ShopContext";
import { money, selectedOptions, selectionError, unitPrice, type Product } from "./model";
import { Empty, ErrorNotice, Modal, Stepper } from "./ui";
import { readStored, writeStored } from "./api";

export function ProductSheet({ product, onClose }: { product: Product; onClose: () => void }) {
  const { add } = useShop();
  const [ids, setIds] = useState<string[]>(() => (product.optionGroups ?? []).flatMap(g => g.minSelections > 0 ? g.options.filter(o => o.isAvailable).slice(0, g.minSelections).map(o => o.id) : []));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  return <Modal title="Chọn theo vị của bạn" onClose={onClose} wide>
    <div className="may-product-detail"><div className="may-detail-photo">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <Coffee size={80} aria-hidden="true" />}<span className="may-photo-caption">Một chút ngọt từ Mây</span></div>
    <div className="may-detail-content"><span className="may-kicker">{product.categoryName}</span><h3>{product.name}</h3><strong className="may-price">{money(product.price)}</strong><p className="may-muted">{product.description}</p>
    {(product.optionGroups ?? []).map(g => <fieldset className="may-option-group" key={g.id}><legend>{g.name} <small>{g.minSelections > 0 ? "Bắt buộc" : "Tùy chọn"} · {g.maxSelections === 1 ? "chọn 1" : `tối đa ${g.maxSelections}`}</small></legend><div className="may-options">{g.options.map(o => <label key={o.id} className={`may-choice ${ids.includes(o.id) ? "is-selected" : ""} ${!o.isAvailable ? "is-disabled" : ""}`}><input type={g.maxSelections === 1 ? "radio" : "checkbox"} name={`option-${g.id}`} checked={ids.includes(o.id)} disabled={!o.isAvailable} onChange={() => { setError(""); setIds(current => g.maxSelections === 1 ? [...current.filter(id => !g.options.some(opt => opt.id === id)), o.id] : current.includes(o.id) ? current.filter(id => id !== o.id) : [...current, o.id]); }} /><span>{o.name}</span><small>{!o.isAvailable ? "Tạm hết" : o.price > 0 ? `+${money(o.price)}` : ""}</small></label>)}</div></fieldset>)}
    <label className="may-field">Ghi chú cho món<textarea maxLength={500} placeholder="Ví dụ: để topping riêng giúp mình…" value={note} onChange={e => setNote(e.target.value)} /></label>
    {error && <ErrorNotice message={error} />}
    <div className="may-sheet-action"><Stepper value={quantity} onChange={n => setQuantity(Math.max(1, n))} label={product.name} /><button className="may-button" disabled={!product.isAvailable} onClick={() => { const validation = selectionError(product, ids); if (validation) { setError(validation); return; } add(product, ids, quantity, note); onClose(); }}>Thêm vào giỏ <span>{money(unitPrice(product, ids) * quantity)}</span><Plus size={17} /></button></div>
    </div></div>
  </Modal>;
}

export function CartContents({ compact = false }: { compact?: boolean }) {
  const { cart, catalog, change } = useShop();
  return <div className={compact ? "may-cart-lines compact" : "may-cart-lines"}>{cart.map(line => {
    const p = catalog?.items.find(item => item.id === line.menuItemId);
    return <article className="may-cart-line" key={line.key}>{!compact && p?.imageUrl && <img src={p.imageUrl} alt="" width="70" height="70" />}<div><strong>{p?.name ?? "Món không còn trong thực đơn"}</strong><p>{p && selectedOptions(p, line.optionIds).map(o => o.name).join(" · ")}</p>{line.note && <p>{line.note}</p>}<div className="may-line-bottom"><b>{p ? money(unitPrice(p, line.optionIds) * line.quantity) : "—"}</b><Stepper value={line.quantity} onChange={n => change(line.key, n)} label={p?.name ?? "món"} /></div></div></article>;
  })}</div>;
}

export function CartPanel() {
  const { cart, count, subtotal, config, orderType } = useShop();
  return <aside className="may-cart-panel"><div className="may-section-row"><h2>Giỏ của bạn</h2><span className="may-count">{count}</span></div>{cart.length ? <><CartContents compact /><dl className="may-totals"><div><dt>Tạm tính</dt><dd>{money(subtotal)}</dd></div><div><dt>Phí giao hàng</dt><dd>{orderType === "Pickup" ? "Tự đến lấy" : "Tính khi chọn địa chỉ"}</dd></div></dl><Link className="may-button" to="/checkout">Tiếp tục đặt món <ArrowRight size={18} /></Link><p className="may-small may-center">Bạn sẽ kiểm tra tổng tiền trước khi đặt.</p></> : <div className="may-cart-empty"><div className="may-bag-art"><ShoppingBag size={48} strokeWidth={1.1} /><span>mây.</span></div><h3>Món ngon đang đợi bạn</h3><p>Thêm một món yêu thích.<br />Mây sẽ chuẩn bị thật ngon.</p></div>}<div className="may-shipping-note"><Truck size={20} /><p><strong>Gần nhau, miễn phí giao</strong><span>Trong bán kính {config?.shippingFreeRadiusKm ?? 5} km từ quán.</span></p></div></aside>;
}

export function MenuPage() {
  const { catalog, loading, error, reload, config, count, subtotal } = useShop();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLocaleLowerCase("vi"));
  const category = params.get("category") ?? "all";
  const [selected, setSelected] = useState<Product | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => { const value = readStored<unknown>("may.favorites", []); return Array.isArray(value) ? value.filter(x => typeof x === "string") : []; });
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sort, setSort] = useState("menu");
  const items = (catalog?.items ?? []).filter(p => (category === "all" || p.categoryId === category) && (!favoriteOnly || favorites.includes(p.id)) && `${p.name} ${p.description}`.toLocaleLowerCase("vi").includes(query));
  if (sort === "price") items.sort((a, b) => a.price - b.price);
  const hero = catalog?.items.find(p => p.name.toLowerCase().includes("matcha")) ?? catalog?.items[0];
  const icons = [Coffee, Leaf, IceCreamBowl, Soup, Cookie];
  return <div className="may-catalog-layout"><div className="may-catalog-main"><div className="may-page-title"><div><p className="may-kicker">Cứ chọn món bạn thích</p><h1>Hôm nay, <em>bạn muốn gì?</em></h1></div><span className="may-season">Trà, kem & những điều ngọt ngào</span></div>
    <section className="may-feature"><div className="may-feature-copy"><span className="may-label">Ghé Mây một chút</span><h2>Một ly xanh.<br />Một ngày nhẹ tênh.</h2><p>Matcha thơm dịu, thêm chút sữa béo.<br />Vị ngon theo cách của bạn.</p><button className="may-button may-button-light" disabled={!hero} onClick={() => hero && setSelected(hero)}>Chọn một ly matcha <ArrowRight size={18} /></button></div><div className="may-feature-image">{hero?.imageUrl && <img src={hero.imageUrl} alt={hero.name} fetchPriority="high" />}<span className="may-feature-stamp">made<br /><em>with love</em></span></div></section>
    <div className="may-menu-tools"><label className="may-search"><Search size={19} aria-hidden="true" /><span className="may-sr-only">Tìm món</span><input type="search" placeholder="Tìm món bạn đang thèm…" value={search} onChange={e => setSearch(e.target.value)} /></label><button className={`may-tool ${favoriteOnly ? "is-active" : ""}`} aria-pressed={favoriteOnly} onClick={() => setFavoriteOnly(v => !v)}><Heart size={18} />Yêu thích</button><label className="may-sort"><SlidersHorizontal size={17} /><span className="may-sr-only">Sắp xếp</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="menu">Thực đơn</option><option value="price">Giá tăng dần</option></select></label></div>
    <nav className="may-categories" aria-label="Danh mục món"><button aria-pressed={category === "all"} className={category === "all" ? "is-active" : ""} onClick={() => setParams({})}><span><ShoppingBag size={23} /></span>Tất cả</button>{catalog?.categories.map((c, i) => { const Icon = icons[i % icons.length]; return <button key={c.categoryId} aria-pressed={category === c.categoryId} className={category === c.categoryId ? "is-active" : ""} onClick={() => setParams({ category: c.categoryId })}><span><Icon size={23} /></span>{c.name}</button>; })}</nav>
    <div className="may-section-row may-menu-heading"><h2>{favoriteOnly ? "Món bạn yêu thích" : category === "all" ? "Thực đơn của Mây" : catalog?.categories.find(c => c.categoryId === category)?.name}</h2>{!loading && <span className="may-muted">{items.length} món để lựa chọn</span>}</div>
    {error ? <ErrorNotice message={error} retry={reload} /> : loading ? <div className="may-product-grid" role="status" aria-label="Đang tải thực đơn">{[1, 2, 3, 4, 5, 6].map(n => <div key={n} className="may-skeleton" />)}</div> : items.length ? <div className="may-product-grid">{items.map((p, i) => <article key={p.id} className={`may-product ${p.isAvailable ? "" : "is-unavailable"}`}><div className={`may-product-image tone-${i % 4}`}><button className="may-photo-button" aria-label={`Chọn ${p.name}`} onClick={() => setSelected(p)}>{p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" width="400" height="300" /> : <Coffee size={65} strokeWidth={1} />}</button><button className={`may-heart ${favorites.includes(p.id) ? "is-saved" : ""}`} aria-label={`${favorites.includes(p.id) ? "Bỏ yêu thích" : "Yêu thích"} ${p.name}`} aria-pressed={favorites.includes(p.id)} onClick={() => setFavorites(current => { const next = current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id]; writeStored("may.favorites", next); return next; })}><Heart size={17} fill={favorites.includes(p.id) ? "currentColor" : "none"} /></button>{!p.isAvailable && <span className="may-product-tag">Tạm hết</span>}</div><div className="may-product-copy"><p className="may-product-category">{p.categoryName}</p><h3><button onClick={() => setSelected(p)}>{p.name}</button></h3><p className="may-product-description">{p.description}</p><div className="may-product-bottom"><strong>{money(p.price)}</strong><button className="may-add" aria-label={`Thêm ${p.name}`} disabled={!p.isAvailable} onClick={() => setSelected(p)}><Plus size={20} /></button></div></div></article>)}</div> : <Empty title="Chưa thấy món bạn tìm" action={<button className="may-button may-button-outline" onClick={() => { setSearch(""); setFavoriteOnly(false); setParams({}); }}>Xem toàn bộ thực đơn</button>}>Thử tên khác hoặc chọn một danh mục nhé.</Empty>}
    <div className="may-menu-footer"><Check size={17} /><p>Tùy chỉnh theo sở thích · Chế biến sau khi tiếp nhận · Giao từ {config?.name ?? "Mây"}</p></div></div><CartPanel />
    {selected && <ProductSheet key={selected.id} product={selected} onClose={() => setSelected(null)} />}
    {count > 0 && <Link to="/checkout" className="may-mobile-cart"><span><ShoppingBag size={19} />{count} món · {money(subtotal)}</span><strong>Xem giỏ <ArrowRight size={18} /></strong></Link>}
  </div>;
}

export function CartPage() { const { count, subtotal } = useShop(); return <div className="may-narrow"><Link className="may-back" to="/">← Tiếp tục chọn món</Link><h1>Giỏ của bạn <span className="may-count">{count}</span></h1>{count ? <div className="may-panel"><CartContents /><div className="may-section-row"><h2>Tạm tính</h2><strong>{money(subtotal)}</strong></div><Link className="may-button" to="/checkout">Chọn cách nhận món <ArrowRight size={18} /></Link></div> : <Empty title="Giỏ đang trống" action={<Link className="may-button" to="/">Khám phá thực đơn</Link>}>Chọn một món ngon để bắt đầu nhé.</Empty>}</div>; }
