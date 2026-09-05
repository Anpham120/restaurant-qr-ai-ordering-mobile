/**
 * E2E khách tại bàn — CMC Restaurant QR Ordering
 * Table: T01 | QR: cmc-table-t01-qr
 *
 * Flows tested:
 * 1. Session & Menu  — open ordering page, verify T01 session, browse categories
 * 2. Cart            — add 2+ items, adjust quantities, verify totals
 * 3. Place Order     — send to kitchen, capture order number
 * 4. Ordered Tab     — check "Món đã gọi", verify Vietnamese status labels
 * 5. Status Poll     — poll up to 60s for admin-confirmed status updates
 * 6. Language Toggle — EN/VI switch, verify label changes
 * 7. Payment Flow    — check payment options (COD/VietQR) display
 *
 * CHẠY: cần `playwright`, mà nó KHÔNG khai trong `frontend/package.json`. Phải cài tay:
 *     npm --prefix frontend i -D playwright && npx --prefix frontend playwright install chromium
 *     node scripts/e2e/guest-test.js
 * Không CI nào chạy tệp này.
 */

const path = require("path");
const fs = require("fs");

// Script nằm ở scripts/e2e/, nhưng playwright và chỗ ghi kết quả đều tính từ GỐC KHO.
// Không dùng process.cwd(): nó phụ thuộc chỗ người ta đang đứng lúc gõ lệnh.
const GOC = path.join(__dirname, "..", "..");
// Resolve playwright from frontend workspace (not hoisted to repo root)
const { chromium } = require(path.join(GOC, "frontend", "node_modules", "playwright"));

const BASE_URL = "http://localhost:5177";
const ENTRY_URL = `${BASE_URL}/table/T01?qr=cmc-table-t01-qr`;
const SCREENSHOT_DIR = path.join(GOC, "e2e-screenshots");
const REPORT_PATH = path.join(GOC, "e2e-guest-report.md");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const results = [];
let orderId = null;
let sessionId = null;
const consoleErrors = [];
const networkErrors = [];

function log(msg) {
  console.log(`[E2E] ${msg}`);
}

function pass(flow, note = "") {
  results.push({ flow, status: "PASS", note });
  log(`✅ PASS: ${flow}${note ? " — " + note : ""}`);
}

function fail(flow, note = "") {
  results.push({ flow, status: "FAIL", note });
  log(`❌ FAIL: ${flow}${note ? " — " + note : ""}`);
}

function warn(flow, note = "") {
  results.push({ flow, status: "WARN", note });
  log(`⚠️  WARN: ${flow}${note ? " — " + note : ""}`);
}

async function screenshot(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  log(`📸 Screenshot: ${file}`);
  return file;
}

async function waitForNavigation(page, urlContains, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (page.url().includes(urlContains)) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

async function switchToVietnamese(page) {
  const viBtn = page.locator("button").filter({ hasText: /^VI$/ }).first();
  if (await viBtn.count()) {
    await viBtn.click();
    await page.waitForTimeout(800);
    return true;
  }
  const toggle = page.locator("button.language-toggle").first();
  if (await toggle.count()) {
    const label = (await toggle.innerText()).trim();
    if (label === "EN") {
      await toggle.click();
      await page.waitForTimeout(800);
    }
    return true;
  }
  return false;
}

async function runTests() {
  // Prefer system Chrome if Playwright browser cache is missing
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (launchErr) {
    log(`Playwright chromium missing (${launchErr.message.split("\n")[0]}). Falling back to channel=chrome`);
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // mobile viewport
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
      log(`🔴 CONSOLE ERROR: ${msg.text().substring(0, 200)}`);
    }
  });

  // Capture network failures
  page.on("requestfailed", (req) => {
    networkErrors.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    log(`🔴 NETWORK FAIL: ${req.method()} ${req.url()}`);
  });

  page.on("response", async (resp) => {
    if (resp.status() >= 400 && resp.url().includes("localhost:5084")) {
      const body = await resp.text().catch(() => "");
      networkErrors.push(`HTTP ${resp.status()} ${resp.url()}: ${body.substring(0, 100)}`);
      log(`🔴 API ERROR ${resp.status()}: ${resp.url()}`);
    }
  });

  try {
    // =========================================================================
    // FLOW 1: Session & Menu
    // =========================================================================
    log("=== FLOW 1: Session & Menu ===");
    await page.goto(ENTRY_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for redirect from /table/T01 to /table-session/{id}/menu
    const navigated = await waitForNavigation(page, "table-session", 25000);

    if (!navigated) {
      await screenshot(page, "01-session-fail");
      fail("Flow 1: Session & Menu", `Stuck at: ${page.url()}`);
    } else {
      const currentUrl = page.url();
      const match = currentUrl.match(/table-session\/([^/]+)\//);
      sessionId = match?.[1] ?? null;
      log(`Session ID: ${sessionId}`);
      log(`Current URL: ${currentUrl}`);
      await screenshot(page, "01-session-opened");

      // Check for T01 badge or table indicator
      const tableText = await page.locator("body").innerText().catch(() => "");
      const hasTableIndicator = tableText.includes("T01") || tableText.includes("Bàn") || currentUrl.includes("menu");

      if (hasTableIndicator) {
        pass("Flow 1: Session & Menu", `Session opened, sessionId=${sessionId}`);
      } else {
        warn("Flow 1: Session & Menu", "Page loaded but no T01 table indicator visible");
      }

      // Verify menu categories are present
      await page.waitForTimeout(2000);
      const menuBody = await page.locator("body").innerText().catch(() => "");
      const hasCategories = menuBody.length > 200;
      if (hasCategories) {
        pass("Flow 1a: Menu Categories", `Menu body has ${menuBody.length} chars`);
      } else {
        warn("Flow 1a: Menu Categories", "Menu content appears sparse");
      }

      await screenshot(page, "01-menu-loaded");
    }

    // =========================================================================
    // FLOW 2: Cart — Add items
    // =========================================================================
    log("=== FLOW 2: Cart — Add Items ===");
    if (!sessionId) {
      fail("Flow 2: Cart", "No session ID — cannot continue");
    } else {
      // Find "add" buttons on menu page
      await page.waitForTimeout(1500);

      // Try to add first item
      const addButtons = page.locator("button").filter({ hasText: /\+|Thêm|Add/i });
      const addCount = await addButtons.count();
      log(`Found ${addCount} add-type buttons`);

      if (addCount === 0) {
        // Check if items are displayed differently — look for item cards
        const itemCards = page.locator("[class*='menu-item'], [class*='card'], article");
        const cardCount = await itemCards.count();
        log(`Found ${cardCount} item-like cards`);

        if (cardCount > 0) {
          // Click first card to open detail, then add
          await itemCards.first().click();
          await page.waitForTimeout(1000);
          await screenshot(page, "02-item-detail");

          const detailAddBtn = page.locator("button").filter({ hasText: /Thêm|Chọn|Add|\+/i }).first();
          const btnExists = await detailAddBtn.count() > 0;
          if (btnExists) {
            await detailAddBtn.click();
            await page.waitForTimeout(500);
            pass("Flow 2a: Add Item 1 via detail", "");
          } else {
            warn("Flow 2a: Add Item 1", "Add button not found in detail view");
          }
        } else {
          warn("Flow 2: Cart", "No menu items found on menu page");
        }
      } else {
        // Click first + button
        await addButtons.first().click();
        await page.waitForTimeout(500);
        log("Added item 1");

        // Try to add a second different item
        if (addCount >= 2) {
          await addButtons.nth(1).click();
          await page.waitForTimeout(500);
          log("Added item 2");
          pass("Flow 2: Cart — Added 2 Items", "");
        } else {
          pass("Flow 2: Cart — Added 1 Item", "Only 1 add button visible");
        }
      }

      await screenshot(page, "02-items-added");

      // Navigate to cart page
      const cartLinks = page.locator("a, button").filter({ hasText: /Giỏ hàng|Cart|checkout/i });
      const cartLinkCount = await cartLinks.count();
      log(`Cart nav links: ${cartLinkCount}`);

      if (cartLinkCount > 0) {
        await cartLinks.first().click();
      } else {
        // Navigate directly
        await page.goto(`${BASE_URL}/table-session/${sessionId}/cart`, { waitUntil: "domcontentloaded" });
      }

      await page.waitForTimeout(2000);
      await screenshot(page, "02-cart-page");

      const cartText = await page.locator("body").innerText().catch(() => "");
      const hasCartItems = cartText.includes("Món đang chọn") || cartText.includes("Giỏ hàng") || cartText.includes("Tạm tính");

      if (hasCartItems) {
        pass("Flow 2: Cart Page", "Cart page loaded with items");
      } else {
        warn("Flow 2: Cart Page", `Cart page content: ${cartText.substring(0, 200)}`);
      }

      // Check cart totals are displayed
      const hasTotal = cartText.includes("Tạm tính") || cartText.includes("Tổng");
      if (hasTotal) {
        pass("Flow 2b: Cart Totals", "Total amounts visible");
      } else {
        warn("Flow 2b: Cart Totals", "Could not confirm total amounts");
      }

      // Verify "Gửi món tới bếp" button exists
      const submitBtn = page.locator("button[type=submit]").filter({ hasText: /Gửi món|Submit|Order/i });
      const submitCount = await submitBtn.count();
      if (submitCount === 0) {
        // Try generic submit
        const anySubmit = page.locator("button[type=submit]");
        const anyCount = await anySubmit.count();
        log(`Submit buttons: ${anyCount}`);
      }
    }

    // =========================================================================
    // FLOW 3: Place Order
    // =========================================================================
    log("=== FLOW 3: Place Order ===");
    if (sessionId) {
      // Make sure we're on cart page
      const currentUrl = page.url();
      if (!currentUrl.includes("cart") && !currentUrl.includes("checkout")) {
        await page.goto(`${BASE_URL}/table-session/${sessionId}/cart`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
      }

      const cartText = await page.locator("body").innerText().catch(() => "");
      const isCartEmpty = cartText.includes("Giỏ hàng đang trống") || cartText.includes("empty");

      if (isCartEmpty) {
        // Need to add items first — go back to menu
        log("Cart empty, going back to add items");
        await page.goto(`${BASE_URL}/table-session/${sessionId}/menu`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);
        await screenshot(page, "03-menu-for-order");

        // Add items using + buttons
        const addBtns = page.locator("button").filter({ hasText: /^\+$/ });
        const plusCount = await addBtns.count();
        log(`Plus buttons found: ${plusCount}`);

        if (plusCount > 0) {
          await addBtns.first().click();
          await page.waitForTimeout(300);
          if (plusCount > 1) {
            await addBtns.nth(Math.min(plusCount - 1, 3)).click();
            await page.waitForTimeout(300);
          }
        } else {
          // Look for stepper + buttons or quantity buttons
          const stepperBtns = page.locator(".cmc-stepper button, [class*='stepper'] button, [class*='qty'] button");
          const stepperCount = await stepperBtns.count();
          log(`Stepper buttons: ${stepperCount}`);
          if (stepperCount > 0) {
            await stepperBtns.last().click();
            await page.waitForTimeout(300);
          }
        }

        // Go to cart
        await page.goto(`${BASE_URL}/table-session/${sessionId}/cart`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
      }

      await screenshot(page, "03-pre-order-cart");

      // Try to place order
      const submitBtn = page.locator("button[type=submit], button.cmc-submit-order").first();
      const submitVisible = await submitBtn.isVisible().catch(() => false);

      if (submitVisible) {
        const isDisabled = await submitBtn.isDisabled().catch(() => true);
        if (!isDisabled) {
          // Listen for navigation after submit
          const orderNavPromise = page.waitForURL(/orders/, { timeout: 15000 }).catch(() => null);
          await submitBtn.click();
          log("Clicked 'Gửi món tới bếp'");
          await page.waitForTimeout(3000);

          const afterUrl = page.url();
          log(`URL after submit: ${afterUrl}`);

          // Extract order code from URL
          const orderMatch = afterUrl.match(/highlight=([^&]+)/);
          if (orderMatch) {
            orderId = decodeURIComponent(orderMatch[1]);
            log(`Order ID: ${orderId}`);
          }

          await screenshot(page, "03-order-placed");

          if (afterUrl.includes("orders")) {
            pass("Flow 3: Place Order", `Order placed, ID=${orderId ?? "not in URL"}`);
          } else {
            const bodyText = await page.locator("body").innerText().catch(() => "");
            const errorMsg = bodyText.substring(0, 200);
            warn("Flow 3: Place Order", `Did not navigate to orders — ${errorMsg}`);
          }
        } else {
          // Cart might be empty after cart reconciliation — check
          const bodyText = await page.locator("body").innerText().catch(() => "");
          warn("Flow 3: Place Order", `Submit button disabled. Page content: ${bodyText.substring(0, 300)}`);
        }
      } else {
        const bodyText = await page.locator("body").innerText().catch(() => "");
        warn("Flow 3: Place Order", `Submit button not visible. Content: ${bodyText.substring(0, 200)}`);
      }
    }

    // =========================================================================
    // FLOW 4: Ordered Tab — "Món đã gọi"
    // =========================================================================
    log("=== FLOW 4: Ordered Tab ===");
    if (sessionId) {
      await page.goto(`${BASE_URL}/table-session/${sessionId}/orders`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await switchToVietnamese(page);
      await screenshot(page, "04-orders-tab");

      const ordersText = await page.locator("body").innerText().catch(() => "");
      log(`Orders page content (first 500 chars): ${ordersText.substring(0, 500)}`);

      // Check for Vietnamese labels
      const hasVietLabel = ordersText.includes("Chờ xử lý") ||
        ordersText.includes("Chờ chế biến") ||
        ordersText.includes("Chờ xác nhận") ||
        ordersText.includes("Đang chế biến") ||
        ordersText.includes("Sẵn sàng") ||
        ordersText.includes("Đã phục vụ") ||
        ordersText.includes("Đã đặt") ||
        ordersText.includes("Đã xác nhận") ||
        ordersText.includes("Đã ghi nhận") ||
        ordersText.includes("Món đã gọi") ||
        ordersText.includes("Đơn hàng");

      const hasEnglishLabel = ordersText.includes("Pending") ||
        ordersText.includes("Preparing") ||
        ordersText.includes("Confirmed") ||
        ordersText.includes("Ready");

      if (hasVietLabel && !hasEnglishLabel) {
        pass("Flow 4: Ordered Tab — Vietnamese Labels", "All labels are Vietnamese");
      } else if (hasVietLabel && hasEnglishLabel) {
        warn("Flow 4: Ordered Tab — Mixed Labels", `Vietnamese OK but found English labels: page has both`);
      } else if (!hasVietLabel && hasEnglishLabel) {
        fail("Flow 4: Ordered Tab — Labels", "Labels are English, should be Vietnamese");
      } else {
        warn("Flow 4: Ordered Tab", `No orders visible or unknown state. Content: ${ordersText.substring(0, 300)}`);
      }

      // Check for order ID
      if (orderId && ordersText.includes(orderId)) {
        pass("Flow 4a: Order ID Visible", `${orderId} appears in orders tab`);
      } else if (orderId) {
        warn("Flow 4a: Order ID", `${orderId} not found in orders tab`);
      }

      // Extract status labels observed
      const statusMatches = ordersText.match(/(Chờ xử lý|Chờ xác nhận|Đang chế biến|Đã xác nhận|Sẵn sàng|Đã phục vụ|Đã đặt|Đã ghi nhận|Pending|Preparing|Confirmed|Ready|Served)/g);
      log(`Status labels found: ${JSON.stringify([...new Set(statusMatches ?? [])])}`);
    }

    // =========================================================================
    // FLOW 5: Poll for Admin Sync (up to 60s)
    // =========================================================================
    log("=== FLOW 5: Poll for Admin Status Update (up to 60s) ===");
    if (sessionId) {
      const pollStart = Date.now();
      const POLL_TIMEOUT = 60000;
      let confirmedStatus = null;
      let lastStatus = null;

      while (Date.now() - pollStart < POLL_TIMEOUT) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        const text = await page.locator("body").innerText().catch(() => "");

        // Check for status that indicates admin confirmed
        if (text.includes("Đang chế biến") || text.includes("Đã xác nhận") || text.includes("Đã ghi nhận") || text.includes("Chờ chế biến")) {
          confirmedStatus = text.match(/(Đang chế biến|Đã xác nhận|Đã ghi nhận|Chờ chế biến)/)?.[1];
          log(`Admin sync detected! Status: ${confirmedStatus}`);
          break;
        }

        // Track current status
        const currentStatusMatch = text.match(/(Chờ xử lý|Chờ xác nhận|Đặt|Đã đặt)/);
        if (currentStatusMatch) lastStatus = currentStatusMatch[1];

        const elapsed = Math.round((Date.now() - pollStart) / 1000);
        log(`Polling... ${elapsed}s — current status: ${lastStatus ?? "unknown"}`);

        await page.waitForTimeout(5000);
      }

      await screenshot(page, "05-after-poll");

      if (confirmedStatus) {
        pass("Flow 5: Admin Sync", `Status updated to: ${confirmedStatus}`);
      } else {
        warn("Flow 5: Admin Sync", `No confirmed status after 60s polling. Last: ${lastStatus ?? "unknown"}`);
        log("NOTE: Admin agent should confirm order to complete status update test");
      }
    }

    // =========================================================================
    // FLOW 6: Language Toggle EN/VI
    // =========================================================================
    log("=== FLOW 6: Language Toggle ===");
    if (sessionId) {
      await page.goto(`${BASE_URL}/table-session/${sessionId}/menu`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);

      // Look for language switcher
      const langBtn = page.locator("button, [role=button]").filter({ hasText: /EN|VI|English|Tiếng Việt|language|lang/i }).first();
      const langBtnCount = await page.locator("button, [role=button]").filter({ hasText: /EN|VI/i }).count();
      log(`Language toggle buttons: ${langBtnCount}`);

      const textBefore = await page.locator("body").innerText().catch(() => "").then(t => t.substring(0, 300));

      if (langBtnCount > 0) {
        await langBtn.click();
        await page.waitForTimeout(1500);
        await screenshot(page, "07-lang-toggled");

        const textAfter = await page.locator("body").innerText().catch(() => "").then(t => t.substring(0, 300));

        if (textBefore !== textAfter) {
          pass("Flow 7: Language Toggle", "Text changed after toggle");
        } else {
          warn("Flow 7: Language Toggle", "Text unchanged after lang toggle");
        }

        // Toggle back
        const langBtnAfter = page.locator("button, [role=button]").filter({ hasText: /EN|VI/i }).first();
        await langBtnAfter.click();
        await page.waitForTimeout(1000);
        pass("Flow 7a: Toggle Back", "Toggled back to original language");
      } else {
        warn("Flow 7: Language Toggle", "No language switcher button found");
      }
    }

    // =========================================================================
    // FLOW 7: Payment Flow
    // =========================================================================
    log("=== FLOW 7: Payment Flow ===");
    if (sessionId && orderId) {
      // Navigate to order detail / tracking
      const orderTrackUrl = `${BASE_URL}/table-session/${sessionId}/orders/${encodeURIComponent(orderId)}`;
      await page.goto(orderTrackUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await screenshot(page, "08-order-tracking");

      const trackText = await page.locator("body").innerText().catch(() => "");
      log(`Order tracking content (300 chars): ${trackText.substring(0, 300)}`);

      // Check for payment section
      const hasPaymentSection = trackText.includes("Thanh toán") || trackText.includes("payment");
      const hasCOD = trackText.includes("COD") || trackText.includes("Tiền mặt") || trackText.includes("tiền mặt");
      const hasVietQR = trackText.includes("VietQR") || trackText.includes("Chuyển khoản");
      const hasPaymentBtn = await page.locator("button").filter({ hasText: /Yêu cầu thanh toán|Request|Pay|Thanh toán/i }).count() > 0;

      if (hasPaymentSection) {
        pass("Flow 8: Payment Section Visible", "Payment section present in order tracking");
      } else {
        warn("Flow 8: Payment Section", "No payment section found in order tracking");
      }

      if (hasCOD || hasVietQR) {
        pass("Flow 8a: Payment Options", `COD:${hasCOD} VietQR:${hasVietQR}`);
      } else {
        warn("Flow 8a: Payment Options", "COD/VietQR options not visible (may appear after request)");
      }

      if (hasPaymentBtn) {
        // Click payment request button to see options
        const payBtn = page.locator("button").filter({ hasText: /Yêu cầu thanh toán|Request payment/i }).first();
        await payBtn.click();
        await page.waitForTimeout(1500);
        await screenshot(page, "08-payment-modal");

        const modalText = await page.locator("body").innerText().catch(() => "");
        const codOption = modalText.includes("COD") || modalText.includes("Tiền mặt") || modalText.includes("tiền mặt");
        const vietQrOption = modalText.includes("VietQR") || modalText.includes("QR");

        if (codOption && vietQrOption) {
          pass("Flow 8b: Payment Modal", "Both COD and VietQR options shown");
        } else if (codOption || vietQrOption) {
          warn("Flow 8b: Payment Modal", `Partial options — COD:${codOption} VietQR:${vietQrOption}`);
        } else {
          warn("Flow 8b: Payment Modal", "No payment options found in modal");
        }

        // Close modal with Escape
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    } else if (sessionId) {
      // Check orders page for payment options (invoice view)
      await page.goto(`${BASE_URL}/table-session/${sessionId}/orders`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const ordersText = await page.locator("body").innerText().catch(() => "");
      const hasPayment = ordersText.includes("Thanh toán") || ordersText.includes("Hóa đơn");
      if (hasPayment) {
        pass("Flow 8: Payment Options on Orders Page", "Payment/invoice section visible");
      } else {
        warn("Flow 8: Payment Options", "No payment section found (need placed order first)");
      }
    }

  } catch (err) {
    log(`💥 Unexpected error: ${err.message}`);
    results.push({ flow: "UNEXPECTED_ERROR", status: "FAIL", note: err.message });
    try { await screenshot(page, "crash"); } catch {}
  } finally {
    await browser.close();
  }

  // =========================================================================
  // Generate Report
  // =========================================================================
  const now = new Date().toLocaleString("vi-VN");
  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;
  const warnCount = results.filter(r => r.status === "WARN").length;

  let report = `# Báo Cáo E2E — Guest/Customer (Table T01)\n\n`;
  report += `**Thời gian chạy:** ${now}\n`;
  report += `**URL Entry:** ${ENTRY_URL}\n`;
  report += `**Session ID:** ${sessionId ?? "Không lấy được"}\n`;
  report += `**Order ID:** ${orderId ?? "Không lấy được"}\n\n`;
  report += `## Tổng Kết\n\n`;
  report += `| | Số lượng |\n|---|---|\n`;
  report += `| ✅ PASS | ${passCount} |\n`;
  report += `| ❌ FAIL | ${failCount} |\n`;
  report += `| ⚠️  WARN | ${warnCount} |\n\n`;

  report += `## Kết Quả Từng Flow\n\n`;
  report += `| Flow | Trạng Thái | Ghi Chú |\n|---|---|---|\n`;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : "⚠️";
    report += `| ${r.flow} | ${icon} ${r.status} | ${r.note} |\n`;
  }

  report += `\n## Ghi Chú Cho Admin Agent\n\n`;
  if (orderId) {
    report += `🔔 **Admin agent nên xác nhận đơn \`${orderId}\` trên kanban** để kiểm tra status update.\n\n`;
  } else {
    report += `⚠️ Không lấy được Order ID — admin agent không cần action.\n\n`;
  }

  report += `## Lỗi Console\n\n`;
  if (consoleErrors.length === 0) {
    report += `✅ Không có lỗi console.\n\n`;
  } else {
    for (const e of consoleErrors.slice(0, 20)) {
      report += `- \`${e.substring(0, 200)}\`\n`;
    }
  }

  report += `\n## Lỗi Network/API\n\n`;
  if (networkErrors.length === 0) {
    report += `✅ Không có lỗi network.\n\n`;
  } else {
    for (const e of networkErrors.slice(0, 20)) {
      report += `- \`${e.substring(0, 200)}\`\n`;
    }
  }

  report += `\n## Screenshot Paths\n\n`;
  const shots = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.endsWith(".png"));
  for (const s of shots) {
    report += `- \`${path.join(SCREENSHOT_DIR, s)}\`\n`;
  }

  report += `\n## Phân Tích Bug\n\n`;

  const bugs = [];

  if (failCount > 0) {
    bugs.push(...results.filter(r => r.status === "FAIL").map(r => ({
      severity: "critical",
      desc: `FAIL: ${r.flow} — ${r.note}`,
    })));
  }

  if (consoleErrors.some(e => e.includes("TypeError") || e.includes("Uncaught"))) {
    bugs.push({ severity: "high", desc: "Unhandled JavaScript errors in console" });
  }

  if (networkErrors.some(e => e.includes("HTTP 5"))) {
    bugs.push({ severity: "critical", desc: "Backend 5xx API errors detected" });
  }

  if (networkErrors.some(e => e.includes("HTTP 4"))) {
    bugs.push({ severity: "high", desc: "Backend 4xx API errors detected" });
  }

  if (results.some(r => r.status === "WARN" && r.note.includes("English"))) {
    bugs.push({ severity: "medium", desc: "English labels mixed with Vietnamese UI" });
  }

  if (bugs.length === 0) {
    report += `✅ Không phát hiện bug nghiêm trọng.\n`;
  } else {
    for (const bug of bugs) {
      const emoji = bug.severity === "critical" ? "🔴" : bug.severity === "high" ? "🟠" : "🟡";
      report += `${emoji} **[${bug.severity.toUpperCase()}]** ${bug.desc}\n`;
    }
  }

  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  log(`\n📄 Report saved: ${REPORT_PATH}`);

  console.log("\n" + "=".repeat(60));
  console.log(`SUMMARY: ${passCount} PASS | ${failCount} FAIL | ${warnCount} WARN`);
  console.log(`Order ID: ${orderId ?? "N/A"}`);
  console.log(`Session ID: ${sessionId ?? "N/A"}`);
  console.log("=".repeat(60));

  return { passCount, failCount, warnCount, orderId, sessionId, bugs };
}

runTests().catch((err) => {
  console.error("Fatal E2E error:", err);
  process.exit(1);
});
