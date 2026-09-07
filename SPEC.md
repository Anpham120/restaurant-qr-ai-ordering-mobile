# Mây — Gọi món bằng QR tại quán

## §G

Refactor repo: cấu trúc rõ, code live, logic state đúng, build/test/deploy proof.

## §C

- Public portal + API contract giữ nếu chưa deprecate.
- Production secret ∉ git.
- Delete source ! caller proof + build/test proof.
- DB enum/string data ! migration + data audit trước breaking change.
- Refactor slice nhỏ, commit riêng, verification cùng commit.

## §I

- ui: customer, ordering, admin Vite portals (giao diện nhà hàng đã gỡ, đang dựng lại); Expo app khách.
- api: Spring Boot `/api/*`.
- api: `POST /api/table-sessions` → active session + capability + `resumeState ∈ {New,CartPending,OrderInProgress,ReadyForPayment,PaymentPending,Paid}`.
- db: Spring Data JPA + PostgreSQL 16; Flyway migrations.
- deploy: Docker Compose + GitHub Actions; staging & production tách cổng.
- rt: STOMP over WebSocket `/hub/orders`; đích `/topic/*`.

## §V

- V1: ∀ payment.Status=Refunded → confirm/fail reject; status, transaction, loyalty unchanged.
- V2: ∀ runtime frontend module ∈ app import graph.
- V3: ∀ Completed order → payment ∈ {Confirmed,Paid}.
- V4: ∀ DineIn order → valid open unexpired TableSession; reopen expires stale first; ≤1 live session/table.
- V7: ∀ terminal order (Completed/Cancelled) → item status immutable.
- V9: ∀ Order/Payment concurrent write → PostgreSQL xmin rowversion participates without schema DDL.
- V10: ∀ deploy → PostgreSQL migration succeeds before API start; normal API boot does not migrate schema.
- V12: ∀ frontend Dockerfile package-manifest COPY → source exists in build context.
- V13: ∀ integration factory + parameterized DineIn lifecycle case → isolated in-memory DB + table/session fixture; no cross-test active-session contention.
- V14: ∀ TableSession → many Order Rounds aggregate into one Table Invoice; promotion, loyalty identity, and payment never belong to an Order Round.
- V15: ∀ integration fixture → production-valid domain values; setup HTTP failure reports response body before lifecycle assertions.
- V16: ∀ TableSession → Order Round creation and settlement start serialize on the shared session; at most one side commits from the same version.
- V17: ∀ TableInvoice.Status=Pending → no order/item cancellation may change payable lines; kitchen progress remains allowed.
- V18: ∀ cancelled settlement → promotion, loyalty phone, method, and discount cleared before ordering resumes.
- V19: ∀ paid TableSession → reports count one paid Table Invoice, while item sales aggregate all non-cancelled Order Rounds.
- V20: ∀ concurrent loyalty accrual → member rowversion or unique conflict prevents lost increments; caller receives conflict, never silent overwrite.
- V21: ∀ PR→main → required `frontend-build`, `backend-test`, and `docker-compose-config` checks instantiate and pass before merge.
- V22: frontend host routing = 6 production + 6 staging canonical domains; retired `customer` alias absent.
- V23: ∀ deploy workflow → every `deploy-vps.sh` required variable supplied before remote mutation.
- V24: ∀ PostgreSQL Order Round creation with retry enabled → serializable transaction executes inside `Database.CreateExecutionStrategy()` and commits exactly once.
- V27: ∀ unhandled API exception → structured `INTERNAL_ERROR` HTTP 500 retains allowed-origin CORS headers; browser never degrades it to opaque `Failed to fetch`.
- V28: ∀ session capability → signature depends only on immutable persisted identity; PostgreSQL timestamp precision changes cannot invalidate a freshly issued token.
- V38: ∀ research benchmark case → expected document IDs ∩ forbidden document IDs = ∅; family source and materialized JSONL remain identical; dev/test artifacts are physically separate and frozen test canonical text bytes are hash-gated before label parsing; query-family split leakage = 0; official menu corpus = exactly 91 canonical items including drinks, with production-seed parity for name/price/description.
- V42: ∀ `/api/users` mutation → `AdminOnly`; create/update/delete persists; duplicate email + missing user deterministic; current admin cannot delete self or remove own Admin role.
- V43: landing + ordering → one warm Vietnamese brand token set; display/body/utility fonts + VND formatting identical; money uses tabular utility numerals.
- V44: landing + ordering locale ∈ {`vi`,`en`} persists across hosts; switch updates static UI, navigation, accessibility copy, dates, money, category, item name + description.
- V45: landing + ordering @ viewport ≥320px → no horizontal overflow; primary controls touch target ≥44px; header/nav/modal respect safe-area; content hierarchy remains readable without zoom.
- V46: ∀ declared `@cmc/*` workspace dependency → matching workspace package + lock entry exist; fresh install then frontend typecheck resolves every package.
- V47: ∀ order-detail invoice action → canonical `/table-session/:sessionId/orders`; never session root/menu.
- V48: kitchen active pipeline = `Placed|Confirmed|Preparing|Ready`; `order.created` reloads board; `Placed` visible in new-order column.
- V49: ∀ relational table-invoice payment request → serializable transaction executes inside EF execution strategy; COD/VietQR capability + idempotency preserved; missing session → structured 404, never 500.
- V50: ordering header has no dashed divider; locale control = one ≥44px current-locale `VI|EN` button; click flips locale.
- V51: ∀ valid table QR scan while session `Open` & unexpired → same `sessionId`; concurrent/multi-device scans create ≤1 active session; response `resumeState` deterministic, token values never logged.
- V52: scan destination solely maps `resumeState`: `New→menu`, `CartPending→cart`, `OrderInProgress→orders`, payment states→`orders?focus=invoice`; ⊥ hardcoded post-scan menu redirect.
- V53: session orders hub reflects aggregate orders/items/invoice; order/payment realtime reloads hub; disconnected realtime → 5s polling; payment pending/paid forbids new ordering.
- V54: `Ready→Served` atomic order + all non-cancelled items; Kitchen|Staff allowed, Kitchen forbidden any other order transition; Kitchen board contains read-only Served column and realtime movement.
- V55: QR/Kitchen state logic has one live resolver/pipeline each; superseded one-shot routing, duplicate status maps, unused feature files/imports absent; full typecheck + tests pass.
- V56: ∀ application log entry → request-controlled values omitted or CR/LF-sanitized before emission; CodeQL `cs/log-forging` findings = 0.
- V57: ∀ verification command → execute from its authoritative component root or pass an explicit project/config path; parent-workspace invocation forbidden.
- V58: ∀ `Placed|Confirmed` order, first active item `Pending→Preparing` → aggregate order `Preparing` in same mutation; refreshed Kitchen board moves card `confirmed→preparing`.
- V59: Kitchen board @ desktop → exactly 4 equal columns `confirmed|preparing|ready|served` in one row; tablet → 2 columns; mobile → 1 column.
- V60: ∀ Kitchen card → one explicit action advances exactly one lane `confirmed→preparing→ready→served`; legacy aggregate/item drift repaired before use so zero-item no-op cannot strand card in an earlier lane.
- V61: ∀ post-deploy/rollback health check → transient TLS failure during Nginx certificate reload is retried (`--retry-all-errors`), not treated as terminal.

## §T

id|status|task|cites
T1|x|remove unreachable frontend modules + empty utils workspace|V2
T2|x|align customer card price + add controls|I.ui
T3|x|payment refund terminal guard + HTTP regression test|V1,I.api
T4|x|table-session open/close/expiry one lifecycle|V4,I.api
T11|x|reject item mutation on terminal parent order|V7
T13|x|run backend regression suite in CI and document it|C
T14|x|remove unregistered in-memory user adapter; name live contract|I.api
T16|x|test menu image fallback resolver and run it in CI|I.ui
T17|x|replace deprecated xmin helper and isolate deploy migration|V9,V10
T7|x|remove tracked duplicate agent skill trees + stale docs|C
T8|x|full repository audit; build/deploy proof|C
T19|x|introduce aggregate Table Invoice and session settlement flow|V14,I.api,I.ui
T25|x|add admin user create/update/delete API + UI + regressions|V42,I.api,I.ui
T26|x|unify landing + ordering brand tokens, typography + VND formatting|V43,I.ui
T27|x|add persistent VI/EN switch + full landing/ordering/menu localization|V44,V46,I.ui
T28|x|optimize landing + ordering responsive mobile layout + regressions|V45,I.ui
T30|x|fix order-detail invoice route|V47
T31|x|surface placed orders in kitchen pipeline|V48
T32|x|run table-invoice payment transaction inside retry strategy|V49
T33|x|simplify ordering header + locale toggle|V45,V50
T34|x|add table-session resume-state resolver + additive open response|V51,I.api
T35|x|route repeat scans + upgrade session orders to realtime state hub|V52,V53,I.ui,I.api
T36|x|add atomic Served transition + fourth Kitchen column|V54,I.api,I.ui
T37|x|remove superseded QR/Kitchen logic + full verification|V55,C
T38|x|fix Kitchen card movement + four-column responsive board|V54,V55,V58,V59,I.api,I.ui
T39|x|repair legacy Kitchen state drift + complete sequential card actions|V54,V58,V59,V60,I.api,I.ui

## §B

id|date|cause|fix
B1|2026-07-11|`PaymentEndpoints` omit `Refunded` confirm/fail guard|V1
B6|2026-07-11|order item transition omits terminal parent order guard|V7
B7|2026-07-11|table open query/insert has no DB uniqueness guard|V4
B9|2026-07-11|retired UserStore co-locates public result contracts|C
B10|2026-07-11|API startup owned production schema migration|V10
B11|2026-07-11|rebase conflict briefly mixed the table expiry query into its foreach body|compile preflight
B14|2026-07-11|frontend Dockerfile copied retired packages/utils manifest|V12
B15|2026-07-12|integration factories reused named EF in-memory DB and lifecycle rows reused table/session during parallel CI|V13
B16|2026-07-12|new Table Invoice endpoint omitted the namespace containing shared API results|compile preflight
B17|2026-07-12|Table Invoice integration test assumed a seeded table index instead of owning its fixture|V13
B18|2026-07-12|cart checkout and payment model attached promotion, loyalty, and settlement to one Order instead of the Table Session|V14
B19|2026-07-12|Table Invoice payment test generated a table code rejected by the production validator|V15
B20|2026-07-12|Table Invoice staff endpoints omitted `Api.Users` namespace for `UserRole`|compile preflight
B21|2026-07-13|integration factory omitted required VietQR bank options for the payment lifecycle|V15
B22|2026-07-13|EF InMemory bound array `Contains` to .NET 10 `ReadOnlySpan` overload in invoice list query|V15
B23|2026-07-13|session-touch patch landed in status update instead of order creation and omitted realtime namespace|compile preflight
B24|2026-07-13|settlement subtotal and new Order Round could commit from the same TableSession version|V16
B25|2026-07-13|pending settlement allowed order/item cancellation to change payable lines|V17
B26|2026-07-13|cancelled settlement retained stale promotion, loyalty phone, method, and discount|V18
B27|2026-07-13|report paid count used Order Rounds while daily revenue used Table Invoices|V19
B28|2026-07-13|loyalty accrual used unguarded read-modify-write|V20
B29|2026-07-13|settlement migration rollback made `order_id` non-null before removing invoice-targeted payments|migration down cleanup
B30|2026-07-13|settlement completion bypassed order history and realtime notification|OrderStore staged completion
B31|2026-07-13|completion audit test referenced `Status` instead of `OrderStatusHistory.ToStatus`|compile preflight
B32|2026-07-13|CI deployment env entries were over-indented, invalidating workflow before required jobs instantiated|V21
B33|2026-07-13|app-separation regression test still required the deliberately retired `customer` redirect|V22
B34|2026-07-13|staging workflow omitted required VietQR deployment variables and exited before SSH|V23
B35|2026-07-13|OrderStore opened a user transaction outside Npgsql retry execution strategy|V24
B38|2026-07-13|exception middleware sat outside CORS and handled only malformed request bodies|V27
B49|2026-07-13|broad healthy and sweet tag selectors overlapped, so rejection benchmark labels marked the same menu documents as both expected and forbidden|V38
B50|2026-07-13|research corpus used a stale 84-item JSON snapshot and omitted the 7-item Bia & Rượu category present in the production seed|V38
B51|2026-07-13|dev benchmark loaded a combined 360-case artifact before filtering, so frozen test labels were parsed during tuning|V38
B52|2026-07-13|new drink records enriched canonical descriptions with unsupported serving sizes, alcohol percentages and ingredients absent from the production seed|V38
B55|2026-07-13|frozen text artifacts were hashed from checkout bytes, so Windows CRLF and Linux LF produced different hashes for identical benchmark content and failed CI|V38
B57|2026-07-13|rollback recreated a healthy stack but its immediate API health check treated a transient TLS certificate mismatch as terminal, so the rollback workflow reported failure despite public 200 responses|V61
B58|2026-07-15|new `@cmc/i18n` workspace package was declared before lock/install refresh, so typecheck could not resolve it|V46
B59|2026-07-15|menu localization generic required category metadata absent from the shared customer `MenuItem` contract|V44
B60|2026-07-15|localized menu filters read a nonexistent `MenuItem.categoryId` instead of joining canonical category name to response category ID|V44
B61|2026-07-15|verification batch ran from the parent workspace, so relative `frontend` prefix missed the repository package|repo-scoped verification command
B62|2026-07-15|menu parity regression expected materialized `m_###` strings while the canonical C# seed declares `Item(index, ...)`|V44
B64|2026-07-15|payment regression still expected legacy `220.000đ` after shared money formatting standardized the UI on Intl VND output|V43
B67|2026-07-15|order-detail invoice link used route-relative parent, resolving to session index then menu redirect|V47
B68|2026-07-15|new orders start `Placed`, but kitchen page and board both admitted only `Confirmed` into new-order column|V48
B69|2026-07-15|payment endpoint opened a serializable transaction outside Npgsql retry execution strategy, causing production 500 before session lookup|V49
B70|2026-07-15|invoice route was referenced inside nested tracking panel without passing session scope, so source assertion passed but ordering typecheck failed|V47,frontend typecheck
B71|2026-07-15|scan page always redirected successful reusable session to `/menu`; open response exposed no semantic resume state|V51,V52
B72|2026-07-15|V53 integration fixture assumed invoice GET persisted a `TableInvoice`; GET only projects a response, so payment-state setup had no row|V53
B74|2026-07-15|release verification invoked Compose without the authoritative `deploy/docker-compose.yml` path and its required CI environment|V21
B75|2026-07-15|admin user endpoint logged route-controlled `userId`, so CodeQL found two CWE-117 log-forging paths and unresolved review threads blocked merge|V56
B76|2026-07-15|backend verification ran from the parent workspace without an explicit solution path, so MSBuild found no project and produced a false test failure|V57
B77|2026-07-15|`Placed` omitted from item-status aggregation + board `auto-fit minmax(340px,1fr)` wrapped Served lane below|V58,V59
B78|2026-07-15|legacy order remained `Placed` while every item was `Ready`; confirmed action selected 0 Pending items and preparing cards had no bulk Ready action|V60
B79|2026-07-15|EF migration-script verification omitted required design-time `EF_CONNECTION_STRING`|V57
B80|2026-07-15|desktop shell PATH omitted required `rtk` wrapper while context runtime provided it|V57
