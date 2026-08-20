# Repository Guidelines

## Agent Coordination

- Spawn subagents when needed.

## Project Structure & Module Organization

- `frontend/` is a React 19/TypeScript workspace. Deployable Vite apps: `customer-web`, `ordering-web`, `admin-web` (package `@cmc/ops-web`), plus legacy redirect stubs `staff-web` / `kitchen-web`. Shared pages live under `src/`.
- `backend-java/` là backend đang chạy: Spring Boot 3.3 / Java 21, build bằng Gradle. Mã theo kiến trúc lục giác cho module `orders` (`domain/`, `application/`, `adapter/in/web/`, `adapter/out/persistence/`); các module còn lại theo lối phẳng vì mật độ invariant thấp — xem kế hoạch §5.3.
- `backend/` (ASP.NET Core) **đã xoá** (#59). Toàn bộ 85 endpoint đã chuyển sang `backend-java/`. Kết quả so khớp hành vi giữa hai bản giữ ở `docs/pm/BAO_CAO_SO_KHOP_NET_JAVA.md` — nay là tài liệu lịch sử, không tái lập được.
- `ai/` contains the FastAPI/RAG service, knowledge base, evaluation data, and notebooks.
- `deploy/` and `.github/workflows/` hold deployment and CI configuration; architecture and operational guidance belongs in `docs/`.

## Build, Test, and Development Commands

Run commands from the indicated directory:

```bash
cd frontend && npm ci && npm run dev       # customer app locally
npm run dev:ops                            # operations app (admin/counter/kitchen)
npm run dev:ordering                       # table ordering app
npm run build                              # type-check and build all Vite apps
./gradlew -p backend-java build            # build + Checkstyle + test
python -m pip install -r ai/requirements.txt
python -m compileall ai/app
```

Run the API with `./gradlew -p backend-java bootRun` (nghe cổng 8081). Run the AI service from `ai/` with `uvicorn app.main:app --reload --port 8001`.

## Coding Style & Naming Conventions

Follow existing formatting: two-space indentation in TypeScript/TSX, and tabs in Java (Checkstyle enforces it). Use `PascalCase` for React components, Java types, and test classes; `camelCase` for TypeScript functions and variables; and descriptive service filenames such as `orderService.ts`. Keep nullable reference types enabled and avoid suppressing TypeScript errors. No repository-wide formatter is configured, so preserve the style of surrounding code and keep diffs focused.

## Verification Guidelines

Frontend regression tests live beside their utilities under `frontend/src`; backend regression tests live in `backend-java/src/test/java`; AI guardrail tests live in `ai/tests`. Verify changes with `npm --prefix frontend test`, frontend type-check/build, `./gradlew -p backend-java build` (gồm Checkstyle và ArchUnit), `PYTHONPATH=ai python -m unittest discover -s ai/tests`, Python bytecode compilation, Docker Compose validation, and focused manual smoke checks for auth, orders, payments, table sessions, and AI guardrails.

## Commit & Pull Request Guidelines

Use Conventional Commits (`feat:`, `fix:`, `style(scope):`, `docs:`, `test:`, `chore:`), matching recent history. Branch from `develop`; prefer `issue-<number>/<user>-<short-task>`. Target PRs to `develop`, include `Closes #<number>`, summarize scope, list verification commands, and attach screenshots for UI changes. CI must pass before merge.

## Security & Configuration

Copy `.env.example` files and keep real secrets out of Git. Document user-visible behavior changes and never change shared API contracts, routes, enums, or database fields without coordinating dependent frontend, backend, and AI code.
