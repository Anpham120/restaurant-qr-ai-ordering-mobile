import { useEffect } from "react";
import { ArrowUpRight, Cloud, MapPin, ShoppingBag, Store, Truck, UserRound, UtensilsCrossed } from "lucide-react";
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/vietnamese-400.css";
import "@fontsource/manrope/vietnamese-500.css";
import "@fontsource/manrope/vietnamese-600.css";
import "@fontsource/manrope/vietnamese-700.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/vietnamese-400.css";
import "@fontsource/newsreader/vietnamese-400-italic.css";
import "./shop.css";
import { ShopProvider, useShop } from "./ShopContext";
import { MenuPage, CartPage } from "./MenuPage";
import { CheckoutPage } from "./CheckoutPage";
import { OrdersPage, OrderPage } from "./OrderPages";
import { AccountPage } from "./AccountPage";
import { Empty, Wordmark } from "./ui";

function Shell() {
  const { config, orderType, setOrderType, count } = useShop();
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); document.title = "Mây · Trà, kem & những điều ngọt ngào"; }, [location.pathname]);
  return <div className="may-app"><a className="may-skip" href="#may-main">Đến nội dung chính</a><div className="may-top-note"><Cloud size={15} aria-hidden="true" /><span>Một chút ngọt, một ngày vui.</span><span>Miễn phí giao trong {config?.shippingFreeRadiusKm ?? 5} km</span></div><header className="may-header"><Wordmark /><nav className="may-desktop-nav" aria-label="Điều hướng chính"><NavLink to="/" end>Đặt món</NavLink><NavLink to="/orders">Đơn của bạn</NavLink><NavLink to="/account">Tài khoản</NavLink></nav><div className="may-header-actions"><Link className="may-icon may-profile" to="/account" aria-label="Tài khoản"><UserRound size={22} /></Link><Link className="may-cart-link" to="/cart"><ShoppingBag size={19} /><span>Giỏ hàng</span><b aria-label={`${count} món trong giỏ`}>{count}</b></Link></div></header>
    <div className="may-store-bar"><div className="may-store-address"><MapPin size={19} /><div><strong>Mây · Hà Đông</strong><span>{config?.address ?? "Đại học CMC · Cơ sở 2"}</span></div></div><div className="may-channel-toggle" aria-label="Cách nhận món"><button className={orderType === "Delivery" ? "is-selected" : ""} aria-pressed={orderType === "Delivery"} onClick={() => setOrderType("Delivery")}><Truck size={17} />Giao tận nơi</button><button className={orderType === "Pickup" ? "is-selected" : ""} aria-pressed={orderType === "Pickup"} onClick={() => setOrderType("Pickup")}><Store size={17} />Tự đến lấy</button></div></div>
    <main id="may-main" className="may-main" tabIndex={-1}><Outlet /></main><footer className="may-footer"><Wordmark /><span>Trà, kem & những điều ngọt ngào.</span><Link to="/account">Mây luôn ở đây <ArrowUpRight size={16} /></Link></footer><nav className="may-bottom-nav" aria-label="Điều hướng di động"><NavLink to="/" end><UtensilsCrossed size={21} />Đặt món</NavLink><NavLink to="/orders"><ShoppingBag size={21} />Đơn hàng</NavLink><NavLink to="/account"><UserRound size={21} />Tài khoản</NavLink></nav></div>;
}
export function ShopApp() { return <BrowserRouter><ShopProvider><Routes><Route element={<Shell />}><Route index element={<MenuPage />} /><Route path="menu" element={<MenuPage />} /><Route path="cart" element={<CartPage />} /><Route path="checkout" element={<CheckoutPage />} /><Route path="orders" element={<OrdersPage />} /><Route path="orders/:orderCode" element={<OrderPage />} /><Route path="account" element={<AccountPage />} /><Route path="*" element={<Empty title="Mây chưa tìm thấy trang này" action={<Link className="may-button" to="/">Về thực đơn</Link>}>Đường dẫn có thể đã thay đổi khi Mây chuyển sang cửa hàng mới.</Empty>} /></Route></Routes></ShopProvider></BrowserRouter>; }
