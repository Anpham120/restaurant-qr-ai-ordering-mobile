import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = new URL("../../", import.meta.url);

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, frontendRoot)), "utf8");
}

describe("marketing and ordering app separation", () => {
  it("keeps transactional modules out of the marketing entrypoint", () => {
    const marketingEntrypoint = read("apps/customer-web/src/main.tsx");
    const menuPreview = read("src/pages/customer/PublicMenuPreviewPage.tsx");

    expect(marketingEntrypoint).not.toContain("OrderingLayout");
    expect(marketingEntrypoint).not.toContain("CartPage");
    expect(marketingEntrypoint).not.toContain("ChatPage");
    expect(marketingEntrypoint).not.toContain("TableScanPage");
    expect(marketingEntrypoint).not.toContain('to="/#cach-dat-mon"');
    expect(marketingEntrypoint).not.toContain("Đặt món tại bàn");
    expect(marketingEntrypoint).toContain("OrderingHostRedirect");
    expect(menuPreview).not.toContain("customerMenuStorage");
    expect(menuPreview).not.toContain("loadMenuCart");
    expect(menuPreview).not.toContain("saveMenuCart");
  });

  it("keeps marketing modules out of the ordering entrypoint", () => {
    const orderingEntrypoint = read("apps/ordering-web/src/main.tsx");
    const orderingMenu = read("src/ordering/OrderingMenuPage.tsx");

    expect(orderingEntrypoint).not.toContain("CustomerHomePage");
    expect(orderingEntrypoint).not.toContain("RestaurantAlbumPage");
    expect(orderingEntrypoint).toContain("OrderingLayout");
    expect(orderingMenu).not.toContain("CustomerTestimonials");
    expect(orderingMenu).not.toContain("CustomerWhyChooseUs");
  });

  it("routes each domain to its own artifact without cross-app public assets", () => {
    const nginxConfig = read("nginx.conf");
    const marketingViteConfig = read("apps/customer-web/vite.config.ts");
    const orderingViteConfig = read("apps/ordering-web/vite.config.ts");

    expect(nginxConfig).toContain("cmcrestaurant.app /usr/share/nginx/html/customer;");
    expect(nginxConfig).toContain("staging.cmcrestaurant.app /usr/share/nginx/html/customer;");
    expect(nginxConfig).toContain("order.cmcrestaurant.app /usr/share/nginx/html/ordering;");
    expect(nginxConfig).toContain("order-staging.cmcrestaurant.app /usr/share/nginx/html/ordering;");
    expect(nginxConfig).toContain("admin.cmcrestaurant.app /usr/share/nginx/html/admin;");
    expect(nginxConfig).toContain("admin-staging.cmcrestaurant.app /usr/share/nginx/html/admin;");
    expect(nginxConfig).toContain("staff.cmcrestaurant.app /usr/share/nginx/html/admin;");
    expect(nginxConfig).toContain("staff-staging.cmcrestaurant.app /usr/share/nginx/html/admin;");
    expect(nginxConfig).toContain("kitchen.cmcrestaurant.app /usr/share/nginx/html/admin;");
    expect(nginxConfig).toContain("kitchen-staging.cmcrestaurant.app /usr/share/nginx/html/admin;");
    expect(nginxConfig).not.toContain("customer.cmcrestaurant.app");
    expect(nginxConfig).toContain("root $cmc_app_root;");
    expect(nginxConfig).toContain("try_files $uri $uri/ /index.html;");
    expect(marketingViteConfig).toContain('publicDir: "../../public"');
    expect(orderingViteConfig).toContain('publicDir: "../../public"');
    expect(orderingViteConfig).not.toContain("customer-web/public");
  });

  it("generates table QR links on the ordering domain", () => {
    const qrManager = read("src/components/qr/AdminQrTableManager.tsx");
    const orderingLink = read("src/utils/tableOrderingLink.ts");

    expect(qrManager).toContain("buildOrderingLink");
    expect(qrManager).toContain("tableOrderingLink");
    expect(orderingLink).toContain("VITE_ORDERING_BASE_URL");
    expect(orderingLink).toContain("https://order.cmcrestaurant.app");
    expect(qrManager).not.toContain("VITE_CUSTOMER_BASE_URL");
    expect(qrManager).not.toContain("https://customer.cmcrestaurant.app");
  });

  it("mounts ops toast inside the admin router so toast links do not crash the shell", () => {
    const adminEntry = read("apps/admin-web/src/main.tsx");

    expect(adminEntry).toContain("<OpsToastProvider>");
    expect(adminEntry).toContain("<OpsErrorBoundary");
    const toast = read("src/components/operations/OpsToastProvider.tsx");
    expect(toast).toContain('<a key={toast.id} className="ops-toast" href={toast.href}');
    expect(toast).not.toContain("from \"react-router-dom\"");
  });
});
