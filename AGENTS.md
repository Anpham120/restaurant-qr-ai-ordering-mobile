# Repository Guidelines

## Agent Coordination

- Spawn subagents when needed.

## Project Structure & Module Organization

- `frontend/` is a React 19/TypeScript workspace. Three deployable Vite apps: `customer-web`, `ordering-web`, and `admin-web` (package `@cmc/ops-web`, serving admin/counter). Giao diện cũ của nhà hàng đã gỡ hết cùng đợt chuyển sang nghiệp vụ quán; ba app hiện dựng một màn hình giữ chỗ (`src/DangXayLai.tsx`) để đường build còn nguyên. Phần dùng lại được nằm ở `packages/` (api-client, auth, brand-ui, i18n, realtime-client, shared-types, shared-ui).
- `backend-java/` là backend đang chạy: Spring Boot 3.3 / Java 21, build bằng Gradle. Mã theo kiến trúc lục giác cho module `orders` (`domain/`, `application/`, `adapter/in/web/`, `adapter/out/persistence/`); các module còn lại theo lối phẳng vì mật độ invariant thấp — xem kế hoạch §5.3.
- `deploy/` and `.github/workflows/` hold deployment and CI configuration; architecture and operational guidance belongs in `docs/`.

## Build, Test, and Development Commands

Run commands from the indicated directory:

```bash
cd frontend && npm ci && npm run dev       # customer app locally
npm run dev:ops                            # operations app (admin/counter/kitchen)
npm run dev:ordering                       # table ordering app
npm run build                              # type-check and build all Vite apps
cd backend-java && ./gradlew build            # build + Checkstyle + test
```

Run the API with `cd backend-java && ./gradlew bootRun` (nghe cổng 8081).

## Coding Style & Naming Conventions

Follow existing formatting: two-space indentation in TypeScript/TSX, and tabs in Java (Checkstyle enforces it). Use `PascalCase` for React components, Java types, and test classes; `camelCase` for TypeScript functions and variables; and descriptive service filenames such as `orderService.ts`. Keep nullable reference types enabled and avoid suppressing TypeScript errors. No repository-wide formatter is configured, so preserve the style of surrounding code and keep diffs focused.

## Verification Guidelines

Frontend regression tests live beside their utilities under `frontend/src`; backend regression tests live in `backend-java/src/test/java`. Verify changes with `npm --prefix frontend test`, frontend type-check/build, `cd backend-java && ./gradlew build` (gồm Checkstyle và ArchUnit), Docker Compose validation, and focused manual smoke checks for auth, orders, payments and table sessions.

## Commit & Pull Request Guidelines

Use Conventional Commits (`feat:`, `fix:`, `style(scope):`, `docs:`, `test:`, `chore:`), matching recent history. Branch from `develop`; prefer `issue-<number>/<user>-<short-task>`. Target PRs to `develop`, include `Closes #<number>`, summarize scope, list verification commands, and attach screenshots for UI changes. CI must pass before merge.

## Security & Configuration

Copy `.env.example` files and keep real secrets out of Git. Document user-visible behavior changes and never change shared API contracts, routes, enums, or database fields without coordinating dependent frontend and backend code.
