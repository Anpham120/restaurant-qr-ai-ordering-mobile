import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ShopApp } from "../../../src/shop/ShopApp";

createRoot(document.getElementById("root")!).render(<StrictMode><ShopApp /></StrictMode>);
