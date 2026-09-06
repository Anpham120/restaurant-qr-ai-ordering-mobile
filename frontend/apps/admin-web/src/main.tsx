import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/shop-ops/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
