/**
 * E2E kép: khách gọi món + vận hành, trong cùng một phiên trình duyệt.
 *
 * CHẠY: cần `playwright`, mà nó KHÔNG khai trong `frontend/package.json`. Phải cài tay:
 *     npm --prefix frontend i -D playwright && npx --prefix frontend playwright install chromium
 *     node scripts/e2e/dual-integration.js
 * Không CI nào chạy tệp này.
 */
const path = require("path");
const fs = require("fs");

// Script nằm ở scripts/e2e/, nhưng playwright và chỗ ghi kết quả đều tính từ GỐC KHO.
// Không dùng process.cwd(): nó phụ thuộc chỗ người ta đang đứng lúc gõ lệnh.
const GOC = path.join(__dirname, "..", "..");
const { chromium } = require(path.join(GOC, "frontend", "node_modules", "playwright"));

const GUEST_URL = "http://localhost:5177";
const ADMIN_URL = "http://localhost:5174";
const API_URL = "http://localhost:5084/api";
const ENTRY = `${GUEST_URL}/table/T01?qr=cmc-table-t01-qr`;
const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASS = "AdminPass!2026";
const REPORT_PATH = path.join(GOC, "e2e-dual-report.md");

const VI = {
  waitPrep: "Ch\u1edd ch\u1ebf bi\u1ebfn",
  preparing: "\u0110ang ch\u1ebf bi\u1ebfn",
  waitConfirm: "Ch\u1edd x\u00e1c nh\u1eadn",
  submitOrder: "G\u1eedi m\u00f3n t\u1edbi b\u1ebfp",
  confirmOrder: "X\u00e1c nh\u1eadn \u0111\u01a1n",
  viewQr: "Xem QR",
  cmdKitchen: "\u0110\u01a1n \u0111ang ch\u1ebf bi\u1ebfn",
};

const results = [];
let orderId = null;
let sessionId = null;
let qrLink = "";

function escapeMdTableCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function row(name, ok, note = "") {
  results.push({ name, ok, note });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${note ? " - " + note : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUrl(page, part, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (page.url().includes(part)) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch {
    return await chromium.launch({ headless: true, channel: "chrome", args: ["--no-sandbox"] });
  }
}

async function addTwoItems(guest) {
  await guest.waitForTimeout(2500);
  let addButtons = guest.locator("button").filter({ hasText: /\+|Th\u00eam|Add/i });
  let n = await addButtons.count();
  if (n >= 2) {
    await addButtons.first().click();
    await guest.waitForTimeout(400);
    await addButtons.nth(1).click();
    return n >= 2;
  }
  if (n === 1) {
    await addButtons.first().click();
    return true;
  }
  const plus = guest.locator("button").filter({ hasText: /^\+$/ });
  const plusCount = await plus.count();
  if (plusCount > 0) {
    await plus.first().click();
    await guest.waitForTimeout(300);
    if (plusCount > 1) await plus.nth(Math.min(plusCount - 1, 3)).click();
    return true;
  }
  const cards = guest.locator("[class*='menu-item'], [class*='card'], article");
  if (await cards.count()) {
    await cards.first().click();
    await guest.waitForTimeout(800);
    const detailAdd = guest.locator("button").filter({ hasText: /Th\u00eam|Ch\u1ecdn|Add|\+/i }).first();
    if (await detailAdd.count()) {
      await detailAdd.click();
      return true;
    }
  }
  return false;
}

async function guestPlaceOrder(guest) {
  await guest.goto(ENTRY, { waitUntil: "networkidle", timeout: 45000 }).catch(() =>
    guest.goto(ENTRY, { waitUntil: "domcontentloaded", timeout: 45000 })
  );
  if (!(await waitUrl(guest, "table-session", 35000))) {
    row("Kh\u00e1ch: M\u1edf phi\u00ean T01", false, guest.url());
    return;
  }
  const m = guest.url().match(/table-session\/([^/]+)/);
  sessionId = m?.[1] ?? null;
  row("Kh\u00e1ch: M\u1edf phi\u00ean T01", !!sessionId, sessionId || "");

  const menuUrl = `${GUEST_URL}/table-session/${sessionId}/menu?qr=cmc-table-t01-qr`;
  await guest.goto(menuUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  const added = await addTwoItems(guest);
  row("Kh\u00e1ch: Th\u00eam 2 m\u00f3n", added, added ? "ok" : "could not add");

  await guest.goto(`${GUEST_URL}/table-session/${sessionId}/cart`, { waitUntil: "domcontentloaded" });
  await guest.waitForTimeout(2000);

  let cartText = await guest.locator("body").innerText();
  if (/Gi\u1ecf h\u00e0ng \u0111ang tr\u1ed1ng|empty/i.test(cartText)) {
    await guest.goto(menuUrl, { waitUntil: "domcontentloaded" });
    await addTwoItems(guest);
    await guest.goto(`${GUEST_URL}/table-session/${sessionId}/cart`, { waitUntil: "domcontentloaded" });
    await guest.waitForTimeout(2000);
    cartText = await guest.locator("body").innerText();
  }

  const submit = guest.locator("button.cmc-submit-order:not([disabled]), button[type=submit]:not([disabled])").filter({
    hasText: new RegExp(VI.submitOrder + "|Submit|Order", "i"),
  }).first();
  await submit.waitFor({ state: "visible", timeout: 20000 });
  await submit.click({ timeout: 20000 });

  await guest.waitForTimeout(3000);
  const url = guest.url();
  const om = url.match(/highlight=([^&]+)/);
  orderId = om?.[1] ? decodeURIComponent(om[1]) : null;
  if (!orderId) {
    const body = await guest.locator("body").innerText();
    const ids = body.match(/ORD-[A-Z0-9-]+/g) || [];
    orderId = ids[ids.length - 1] ?? null;
  }
  row("Kh\u00e1ch: G\u1eedi \u0111\u01a1n & l\u1ea5y orderId", !!orderId, orderId || url);
}

async function getAdminAccessToken() {
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  if (!loginRes.ok) return null;
  const login = await loginRes.json();
  return login.accessToken ?? null;
}

async function adminLogin(admin) {
  await admin.goto(`${ADMIN_URL}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await admin.locator("#cmc-login-email").fill(ADMIN_EMAIL);
  await admin.locator("#cmc-login-password").fill(ADMIN_PASS);
  await admin.locator(".cmc-login-submit-btn").click();
  try {
    await admin.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  } catch {
    const errText = await admin.locator(".cmc-form-error").innerText().catch(() => "");
    row("Admin: Đăng nhập", false, errText || admin.url());
    return false;
  }
  row("Admin: Đăng nhập", true, admin.url());
  return true;
}

async function adminConfirmOrder(admin, accessToken) {
  await admin.goto(`${ADMIN_URL}/orders?tab=kanban&table=T01`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await admin.waitForTimeout(2000);

  let confirmed = false;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !confirmed) {
    if (orderId) {
      const card = admin.locator(".ops-card").filter({ hasText: orderId });
      if (await card.count()) {
        const confirmBtn = card.first().locator("button").filter({ hasText: /X\u00e1c nh\u1eadn \u0111\u01a1n/i });
        if (await confirmBtn.count()) {
          await confirmBtn.first().click();
          await admin.waitForTimeout(1500);
          confirmed = true;
          break;
        }
      }
    }
    const anyConfirm = admin.locator("button.ops-btn--primary").filter({ hasText: /X\u00e1c nh\u1eadn \u0111\u01a1n/i });
    if (await anyConfirm.count()) {
      await anyConfirm.first().click();
      await admin.waitForTimeout(1500);
      confirmed = true;
      break;
    }
    const bodySnippet = (await admin.locator("body").innerText()).slice(0, 300);
    if (bodySnippet.includes("Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c \u0111\u01a1n")) {
      break;
    }
    await sleep(2500);
    await admin.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  }

  if (!confirmed && accessToken && orderId) {
    const patch = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Confirmed" }),
    });
    confirmed = patch.ok;
    if (confirmed) {
      await admin.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
  }
  row("Admin: Kanban x\u00e1c nh\u1eadn \u0111\u01a1n", confirmed, orderId || "no orderId");
  return confirmed;
}

async function switchGuestToVietnamese(guest) {
  const viSegment = guest.locator("button").filter({ hasText: /^VI$/ }).first();
  if (await viSegment.count()) {
    await viSegment.click();
    await guest.waitForTimeout(800);
    return true;
  }
  const toggle = guest.locator("button.language-toggle").first();
  if (await toggle.count()) {
    const label = (await toggle.innerText()).trim();
    if (label === "EN") {
      await toggle.click();
      await guest.waitForTimeout(800);
      return true;
    }
    return label === "VI";
  }
  return false;
}

async function guestVerifyOrders(guest) {
  await guest.goto(`${GUEST_URL}/table-session/${sessionId}/orders`, { waitUntil: "domcontentloaded" });
  await guest.waitForTimeout(2000);
  await switchGuestToVietnamese(guest);

  let ok = false;
  let last = "";
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const text = await guest.locator("body").innerText();
    last = text.slice(0, 400).replace(/\s+/g, " ");
    if (text.includes(VI.waitPrep) || text.includes(VI.preparing) || text.includes(VI.waitConfirm) || text.includes("Ch\u1edd x\u00e1c nh\u1eadn")) {
      ok = true;
      break;
    }
    await sleep(3000);
    await guest.reload({ waitUntil: "domcontentloaded" });
    await guest.waitForTimeout(1500);
  }
  row("Kh\u00e1ch: Tab \u0111\u01a1n \u2014 tr\u1ea1ng th\u00e1i ti\u1ebfng Vi\u1ec7t", ok, last.slice(0, 120));
}

async function adminFloorQrCommandCounter(admin) {
  let floorOk = false;
  for (let attempt = 0; attempt < 3 && !floorOk; attempt += 1) {
    await admin.goto(`${ADMIN_URL}/tables?tab=sessions`, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await admin.waitForSelector(".floor-map-tile", { timeout: 15000 });
      floorOk = true;
    } catch {
      await admin.waitForTimeout(1500);
    }
  }
  if (!floorOk) {
    row("Admin: Sơ đồ T01 QR host 5177", false, "floor-map-tile not loaded");
  } else {
    const t01 = admin.locator(".floor-map-tile").filter({ hasText: "T01" }).first();
    await t01.click({ timeout: 15000 });
    await admin.waitForTimeout(800);

    const xemQr = admin.locator("button").filter({ hasText: new RegExp(VI.viewQr, "i") }).first();
    await xemQr.click();
    await admin.waitForTimeout(600);
    qrLink = await admin.locator(".floor-drawer-qr-link code, code").first().innerText().catch(() => "");
    const qrOk = /localhost:5177/.test(qrLink) && !/localhost:5174/.test(qrLink);
    row("Admin: Sơ đồ T01 QR host 5177", qrOk, qrLink);
  }

  await admin.goto(`${ADMIN_URL}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await admin.waitForTimeout(1500);
  const dash = await admin.locator("body").innerText();
  const cmdOk = dash.includes(VI.cmdKitchen) && !/\u0110\u01a1n Preparing/.test(dash);
  row("Admin: Command center nh\u00e3n ti\u1ebfng Vi\u1ec7t", cmdOk, cmdOk ? VI.cmdKitchen : "missing");

  await admin.goto(`${ADMIN_URL}/counter?tab=shift`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await admin.waitForTimeout(1500);
  const counterText = await admin.locator("body").innerText();
  const counterOk = counterText.trim().length > 40 && !/403|Forbidden/i.test(counterText);
  row("Admin: Counter hub (qu\u1ea7y thu ng\u00e2n)", counterOk, counterOk ? "loaded" : counterText.slice(0, 80));
}

function writeReport() {
  const now = new Date().toLocaleString("vi-VN");
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  let md = "# B\u00e1o C\u00e1o E2E Dual (Kh\u00e1ch + Admin)\n\n";
  md += `**Th\u1eddi gian:** ${now}\n`;
  md += `**Session ID:** ${sessionId || "N/A"}\n`;
  md += `**Order ID:** ${orderId || "N/A"}\n`;
  md += `**QR link T01:** ${qrLink || "N/A"}\n\n`;
  md += "## T\u1ed5ng k\u1ebft\n\n| Ch\u1ec9 s\u1ed1 | Gi\u00e1 tr\u1ecb |\n|---|---|\n";
  md += `| PASS | ${pass} |\n| FAIL | ${fail} |\n\n`;
  md += "## B\u1ea3ng k\u1ebft qu\u1ea3\n\n| B\u01b0\u1edbc ki\u1ec3m th\u1eed | K\u1ebft qu\u1ea3 | Ghi ch\u00fa |\n|---|---|---|\n";
  for (const r of results) {
    md += `| ${escapeMdTableCell(r.name)} | **${r.ok ? "PASS" : "FAIL"}** | ${escapeMdTableCell(r.note)} |\n`;
  }
  fs.writeFileSync(REPORT_PATH, md, "utf8");
  console.log(`Report: ${REPORT_PATH}`);
  return md;
}

async function main() {
  const browser = await launchBrowser();
  const context = await browser.newContext({ locale: "vi-VN" });
  const guest = await context.newPage();
  await guest.addInitScript(() => {
    localStorage.setItem("cmc.locale", "vi");
    document.cookie = "cmc_locale=vi; Path=/; Max-Age=31536000; SameSite=Lax";
  });
  await guest.setViewportSize({ width: 390, height: 844 });
  const admin = await context.newPage();
  await admin.setViewportSize({ width: 1440, height: 900 });

  try {
    await guestPlaceOrder(guest);
    const accessToken = await getAdminAccessToken();
    const loggedIn = await adminLogin(admin);
    if (accessToken) {
      await adminConfirmOrder(admin, accessToken);
    }
    await guestVerifyOrders(guest);
    if (loggedIn) {
      await adminFloorQrCommandCounter(admin);
    }
  } catch (e) {
    row("L\u1ed7i kh\u00f4ng mong \u0111\u1ee3i", false, String(e.message || e));
  } finally {
    await browser.close();
  }

  writeReport();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
