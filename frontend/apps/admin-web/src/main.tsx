import { StrictMode, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { AuthProvider, ProtectedRoute, useAuth } from "@cmc/auth";
import {
  LoginPage,
  NotFoundPage,
  OperationsLayout,
  UnauthorizedPage,
  type PortalLink,
} from "@cmc/shared-ui";
import "@cmc/shared-ui/styles.css";
import "../../../src/styles.css";
import "../../../src/components/operations/operations.css";
import { MenuHubPage } from "../../../src/pages/admin/MenuHubPage";
import { OrdersHubPage } from "../../../src/pages/admin/OrdersHubPage";
import { RoleLandingPage } from "../../../src/pages/admin/RoleLandingPage";
import { TableHubPage } from "../../../src/pages/admin/TableHubPage";
import { TableOrdersPage } from "../../../src/pages/admin/TableOrdersPage";
import { AdminUserManagementPage } from "../../../src/pages/admin/AdminUserManagementPage";
import { AdminPromotionsPage } from "../../../src/pages/admin/AdminPromotionsPage";
import { AdminLoyaltyPage } from "../../../src/pages/admin/AdminLoyaltyPage";
import { AdminReportsPage } from "../../../src/pages/admin/AdminReportsPage";
import { KitchenPage } from "../../../src/pages/KitchenPage";
import { CounterHubPage } from "../../../src/pages/counter/CounterHubPage";
import { OpsNavBadgesProvider, useOpsNavBadges } from "../../../src/components/operations/OpsNavBadgesProvider";
import { OpsToastProvider } from "../../../src/components/operations/OpsToastProvider";
import { OpsConfirmProvider } from "../../../src/components/operations/OpsConfirmProvider";
import { OpsRealtimeProvider } from "../../../src/components/operations/OpsRealtimeProvider";
import { OpsAssistanceProvider } from "../../../src/components/operations/OpsAssistanceProvider";
import { OpsErrorBoundary } from "../../../src/components/operations/OpsErrorBoundary";
import { CounterMobileShell } from "../../../src/components/operations/CounterMobileShell";
import { getOrderingBaseUrl } from "../../../src/utils/tableOrderingLink";
import {
  Activity,
  BookOpen,
  ShoppingBag,
  Receipt,
  Users,
  ClipboardList,
  ChefHat,
  BadgePercent,
  Star,
  BarChart3,
  Armchair,
} from "lucide-react";

const roleRedirects = {
  Admin: "/",
  CounterStaff: "/counter",
  Staff: "/counter",
  Kitchen: "/kitchen/board",
} as const;

const BASE_ADMIN_LINKS: PortalLink[] = [
  { to: "/", label: "Trung tâm", icon: <Activity size={18} />, section: "Vận hành" },
  { to: "/orders?tab=table", label: "Đơn hàng", icon: <ShoppingBag size={18} />, section: "Vận hành" },
  { to: "/tables", label: "Bàn", icon: <Armchair size={18} />, section: "Vận hành" },
  { to: "/counter?tab=shift", label: "Giám sát ca", icon: <Receipt size={18} />, section: "Vận hành" },
  { to: "/menu", label: "Thực đơn", icon: <BookOpen size={18} />, section: "Danh mục" },
  { to: "/promotions", label: "Khuyến mãi", icon: <BadgePercent size={18} />, section: "Khách hàng" },
  { to: "/loyalty", label: "Tích điểm", icon: <Star size={18} />, section: "Khách hàng" },
  { to: "/reports", label: "Báo cáo", icon: <BarChart3 size={18} />, section: "Hệ thống" },
  { to: "/users", label: "Người dùng", icon: <Users size={18} />, section: "Hệ thống" },
];

const BASE_COUNTER_LINKS: PortalLink[] = [
  { to: "/counter?tab=payments", label: "Quầy thu ngân", icon: <Receipt size={18} /> },
  { to: "/orders", label: "Đơn hàng", icon: <ClipboardList size={18} /> },
  { to: "/tables", label: "Bàn", icon: <Armchair size={18} /> },
];

const kitchenLinks: PortalLink[] = [
  { to: "/kitchen/board", label: "Bảng bếp", icon: <ChefHat size={18} /> },
];

function CustomerTableRedirect() {
  const { tableCode } = useParams();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const qrToken = searchParams.get("qr");
    const path = qrToken ? `/enter/${encodeURIComponent(qrToken)}` : `/table/${encodeURIComponent(tableCode ?? "")}`;
    window.location.replace(new URL(path, getOrderingBaseUrl()).toString());
  }, [searchParams, tableCode]);
  return <main className="cmc-redirect-page"><h1>Đang mở ứng dụng gọi món</h1></main>;
}

function RoleAwareOpsShell() {
  const { user, loading } = useAuth();
  const { badges } = useOpsNavBadges();

  const adminLinks = useMemo(() => BASE_ADMIN_LINKS.map((link) => ({
    ...link,
    badge: link.to === "/orders" ? badges.orders
      : link.to === "/counter" ? badges.counter
        : link.to === "/tables" ? badges.tables
          : link.to === "/kitchen/board" ? badges.kitchen
            : undefined,
  })), [badges]);

  const counterLinks = useMemo(() => BASE_COUNTER_LINKS.map((link) => ({
    ...link,
    badge: link.to === "/orders" ? badges.orders
      : link.to === "/counter" ? badges.counter
        : link.to === "/tables" ? badges.tables
          : undefined,
  })), [badges]);

  if (loading) return <div className="cmc-state" role="status">Đang xác minh phiên đăng nhập...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "Kitchen") {
    return <OperationsLayout title="Bảng bếp" subtitle="Theo dõi thời gian thực" links={kitchenLinks} />;
  }
  if (user.role === "CounterStaff" || user.role === "Staff") {
    return (
      <OperationsLayout
        title="Quầy vận hành"
        subtitle="Thu ngân & phiên bàn"
        links={counterLinks}
        bottomNav={<CounterMobileShell />}
      />
    );
  }
  if (user.role === "Admin") {
    return <OperationsLayout title="CMC Operations" subtitle="Vận hành nhà hàng" links={adminLinks} />;
  }
  return <Navigate to="/login" replace />;
}

const router = createBrowserRouter([
  { path: "/table/:tableCode", element: <CustomerTableRedirect /> },
  {
    path: "/login",
    element: (
      <LoginPage
        portalName="CMC Operations"
        allowedRoles={["Admin", "CounterStaff", "Staff", "Kitchen"]}
        roleRedirects={roleRedirects}
      />
    ),
  },
  { path: "/unauthorized", element: <UnauthorizedPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute allowedRoles={["Admin", "CounterStaff", "Staff", "Kitchen"]}>
        <OpsNavBadgesProvider>
          <OpsToastProvider>
            <OpsConfirmProvider>
              <OpsErrorBoundary scope="ops-shell">
                <RoleAwareOpsShell />
              </OpsErrorBoundary>
            </OpsConfirmProvider>
          </OpsToastProvider>
        </OpsNavBadgesProvider>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <RoleLandingPage /> },
      { path: "menu", element: <ProtectedRoute allowedRoles={["Admin"]}><MenuHubPage /></ProtectedRoute> },
      { path: "categories", element: <Navigate to="/menu?tab=categories" replace /> },
      { path: "orders", element: <ProtectedRoute allowedRoles={["Admin", "CounterStaff", "Staff"]}><OrdersHubPage /></ProtectedRoute> },
      { path: "invoices", element: <Navigate to="/counter?tab=invoices" replace /> },
      { path: "promotions", element: <ProtectedRoute allowedRoles={["Admin"]}><AdminPromotionsPage /></ProtectedRoute> },
      { path: "loyalty", element: <ProtectedRoute allowedRoles={["Admin"]}><AdminLoyaltyPage /></ProtectedRoute> },
      { path: "reports", element: <ProtectedRoute allowedRoles={["Admin"]}><AdminReportsPage /></ProtectedRoute> },
      { path: "access", element: <Navigate to="/users" replace /> },
      { path: "sessions", element: <Navigate to="/tables?tab=sessions" replace /> },
      { path: "tables/:tableCode/orders", element: <ProtectedRoute allowedRoles={["Admin", "CounterStaff", "Staff"]}><TableOrdersPage /></ProtectedRoute> },
      { path: "tables", element: <ProtectedRoute allowedRoles={["Admin", "CounterStaff", "Staff"]}><TableHubPage /></ProtectedRoute> },
      { path: "users", element: <ProtectedRoute allowedRoles={["Admin"]}><AdminUserManagementPage /></ProtectedRoute> },
      { path: "counter", element: <ProtectedRoute allowedRoles={["Admin", "CounterStaff", "Staff"]}><CounterHubPage /></ProtectedRoute> },
      { path: "staff/orders", element: <Navigate to="/orders" replace /> },
      { path: "staff/payments", element: <Navigate to="/counter?tab=payments" replace /> },
      { path: "staff", element: <Navigate to="/counter" replace /> },
      { path: "kitchen", element: <Navigate to="/kitchen/board" replace /> },
      { path: "kitchen/board", element: <ProtectedRoute allowedRoles={["Kitchen"]}><KitchenPage /></ProtectedRoute> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <OpsRealtimeProvider>
        <OpsAssistanceProvider>
          <RouterProvider router={router} />
        </OpsAssistanceProvider>
      </OpsRealtimeProvider>
    </AuthProvider>
  </StrictMode>,
);
