# Quy trình Git và làm việc nhóm

> **⚠️ Kiểm lần cuối: 2026-06-19. Mã sửa gần nhất: 2026-08-02.**
>
> Tài liệu này KHÔNG trỏ vào tệp hay endpoint nào đã biến mất — đã kiểm bằng máy. Nhưng phép
> kiểm đó chỉ bắt được *đường dẫn chết*, **không** bắt được *hành vi đã đổi*: một endpoint còn
> nguyên tên mà đổi dạng phản hồi thì vẫn 'sạch'. Đối chiếu với mã trước khi tin phần chi tiết.

> **Một tài liệu cho toàn bộ mảng này.** Gộp từ 5 tệp: `GIT_WORKFLOW.md`, `BRANCH_RULESET.md`, `TEAM_WORKFLOW.md`, `WEEKLY_REPORT_TEMPLATE.md`, `REPO_HYGIENE.md`.
>
> Năm tệp cùng nói cách nhóm cộng tác trên mã: nhánh, PR, review, báo cáo tuần, vệ sinh repo.


---

## Quy trình Git

*(gộp từ `docs/GIT_WORKFLOW.md`)*

Tài liệu này quy định cách dùng branch, pull request và release cho dự án **CMC Restaurant — QR Ordering**. README chỉ giới thiệu dự án; toàn bộ quy trình làm việc, review và CI/CD được đặt trong tài liệu này và các tài liệu DevOps liên quan.

Trạng thái hiện tại: CI/CD đã được triển khai bằng GitHub Actions (`.github/workflows/**`) và Docker/deploy config. Phần còn lại để pipeline trở thành cổng bắt buộc là bật branch ruleset và required checks tương ứng trên repo.

### 1. Mô Hình Branch

Dự án sử dụng ba nhóm branch chính:

- `main`: nhánh release/production. Khi có push hoặc merge vào `main`, production workflow phải tự chạy build, test và deploy nếu kiểm tra đạt.
- `develop`: nhánh tích hợp. Khi có push hoặc merge vào `develop`, staging workflow phải tự chạy nếu kiểm tra đạt.
- `issue-<number>/<github-username>-<short-task>`: branch riêng cho từng issue.

Không làm việc trực tiếp trên `main`. Với `develop`, chỉ push trực tiếp khi Lead cho phép trong tình huống đặc biệt; mặc định mọi thay đổi đi qua PR.

### 2. Quy Trình Làm Issue

1. Đọc issue được giao.
2. Kiểm tra `Goal`, `Allowed Files / Areas`, `Do Not Touch` và `Acceptance Criteria`.
3. Cập nhật branch nền:

```bash
git checkout develop
git pull origin develop
```

4. Tạo branch đúng format:

```bash
git checkout -b issue-<number>/<github-username>-<short-task>
```

5. Làm đúng phạm vi issue.
6. Chạy build/test phù hợp.
7. Commit bằng Conventional Commits.
8. Push branch lên GitHub.
9. Mở PR vào `develop`.
10. PR phải có `Closes #<issue_number>`.
11. Comment báo cáo kết quả trong issue hoặc PR.

### 3. Pull Request Vào `develop`

PR vào `develop` phải đạt:

- Đúng phạm vi issue.
- Không sửa file ngoài scope nếu chưa được Lead đồng ý.
- Có bằng chứng build/test.
- CI frontend/backend pass.
- Required status checks pass.
- Merge queue pass trên trạng thái mới nhất của `develop`.
- Auto-merge được bật sau khi đủ điều kiện.
- Không yêu cầu review/approval thủ công trong luồng bình thường.

Sau khi PR được merge vào `develop`, staging deployment tự chạy. Developer không deploy staging hoặc production từ máy cá nhân.

### 4. Release Từ `develop` Sang `main`

Release production đi qua PR từ `develop` sang `main`.

Điều kiện merge:

- CI chạy lại và pass trên release PR.
- Checklist demo đã sẵn sàng.
- Không còn issue critical mở.
- Release PR do workflow promote tạo hoặc cập nhật từ `develop`.
- Required status checks và merge queue đạt.
- Auto-merge được bật cho release PR.
- Branch protection không bị tắt để merge nhanh.

Sau khi code vào `main`, production workflow tự chạy. Không có bước duyệt deploy thủ công sau khi `main` nhận code.

### 5. CI/CD Theo Branch

#### `develop`

- PR vào `develop`: chạy CI.
- Push/merge vào `develop`: chạy CI và staging deploy nếu đạt.
- Nếu staging health/smoke check fail, workflow phải fail và báo lại trong PR/issue.

#### `main`

- PR vào `main`: chạy CI.
- Push/merge vào `main`: chạy production build-test-deploy tự động.
- Nếu build/test fail, deployment không được bắt đầu.
- Nếu health/smoke check fail, workflow phải fail và rollback hoặc in checklist rollback.

### 6. Branch Protection

#### `develop`

- Require pull request before merge.
- Require status checks.
- Require merge queue.
- Allow auto-merge sau khi required checks và merge queue đạt.
- Không require human review trong luồng bình thường.
- Block force push.
- Block deletion.

#### `main`

- Require pull request before merge.
- Require status checks.
- Require merge queue.
- Chỉ chấp nhận release PR từ `develop` do workflow promote tạo/cập nhật.
- Allow auto-merge sau khi required checks và merge queue đạt.
- Không require human review trong luồng bình thường.
- Block force push.
- Block deletion.

Branch protection là cổng kiểm soát trước khi code vào branch quan trọng. Nó không phải là bước duyệt deploy sau khi code đã vào `main`.

### 7. Conventional Commits

Nên dùng commit rõ nghĩa:

```bash
feat: add customer order placement api
fix: correct unavailable menu item validation
docs: add devops release process
ci: add frontend and backend build workflow
chore: add docker compose deployment config
test: add order service integration tests
```

Không dùng commit mơ hồ:

```bash
update
fix bug
done
new code
```

### 8. Quy Tắc Cho AI Agent

Khi dùng AI agent hỗ trợ lập trình, agent phải làm đúng issue đang được giao.

AI agent được phép:

- Sửa đúng file trong phạm vi issue.
- Chạy kiểm tra phù hợp.
- Báo cáo rõ thay đổi, test và giới hạn.
- Hỏi lại nếu cần sửa ngoài scope.

AI agent không được phép:

- Tự ý đổi API contract, enum, database field hoặc route dùng chung.
- Tự ý sửa vùng code của issue khác.
- Push trực tiếp vào `main`.
- Commit secrets thật.
- Đóng issue khi chưa có bằng chứng.

### 9. Checklist Trước Khi Yêu Cầu Review

- [ ] Branch đúng format.
- [ ] PR target là `develop`, trừ release PR từ `develop` sang `main`.
- [ ] PR có `Closes #<issue_number>`.
- [ ] Diff đúng phạm vi issue.
- [ ] Frontend build đã chạy nếu có sửa frontend.
- [ ] Backend restore/build/test đã chạy nếu có sửa backend.
- [ ] CI/CD evidence đã được ghi nếu có sửa DevOps.
- [ ] Không commit secrets thật.
- [ ] Đã báo cáo kết quả trong issue hoặc PR.

---

## Quy tắc nhánh và check bắt buộc

*(gộp từ `docs/BRANCH_RULESET.md`)*

This file records the branch protection settings the repository ruleset must
enforce. The GitHub Actions workflows already define these check names; the
repository settings must match this document so the checks become mandatory
gates.

### develop

- Require pull request before merging.
- Require status checks before merging.
- Required checks:
  - `frontend-build`
  - `backend-test`
  - `docker-compose-config`
- Enable merge queue when the repository plan supports it.
- Allow auto-merge.
- Block force pushes.
- Block branch deletion.

### main

- Require pull request before merging.
- Release PR should be created from a workflow-managed release branch by
  `Promote Production`. The release branch is based on `main` and merges
  `develop` before opening the PR.
- Require status checks before merging.
- Required checks:
  - `frontend-build`
  - `backend-test`
  - `docker-compose-config`
- Enable merge queue when the repository plan supports it.
- Allow auto-merge.
- Block force pushes.
- Block branch deletion.

### Notes

- GitHub Actions workflows define the check names, but repository rulesets must
  be enabled in GitHub settings so these checks become mandatory gates.
- Human review is not required in the normal flow. People intervene only when
  checks fail, scope is wrong, or production risk is high.
- `Promote Production` should use `RELEASE_BOT_TOKEN` instead of relying only on
  `GITHUB_TOKEN`, because release PR checks must be triggered as normal
  pull-request checks before `main` accepts the merge.

---

## Quy trình làm việc nhóm

*(gộp từ `docs/TEAM_WORKFLOW.md`)*

Tài liệu này mô tả cách nhóm phối hợp khi phát triển **CMC Restaurant — QR Ordering**. README dùng để giới thiệu dự án; tài liệu này dùng cho phân công, policy CI/CD, báo cáo và phối hợp với AI agent.

Trạng thái hiện tại: pipeline DevOps tự động đã được triển khai trong `.github/workflows/**`; phần còn lại để hoàn tất là bật branch ruleset, required checks/merge queue và cấu hình GitHub Secrets trên repo.

### 1. Vai Trò Chính

#### Lead

- Điều phối milestone, issue và phạm vi công việc.
- Thiết lập tiêu chuẩn chất lượng, scope issue và rule cần kiểm tra tự động.
- Theo dõi ngoại lệ khi pipeline fail hoặc PR có rủi ro lớn.
- Đảm bảo tài liệu, demo và báo cáo cuối cùng nhất quán.

#### Developer

- Làm issue được giao trên branch riêng.
- Giữ thay đổi trong đúng phạm vi issue.
- Chạy build/test phù hợp trước khi mở PR.
- Không deploy production thủ công.
- Không giữ production secrets.

#### Reviewer / Quality Gate

- Trong luồng bình thường, quality gate là CI, required checks, ruleset và merge queue.
- Review thủ công chỉ dùng khi pipeline fail, PR vượt phạm vi, hoặc Lead/DevOps đánh dấu rủi ro cao.
- Không merge nếu required checks fail hoặc branch protection bị tắt để đi nhanh.

#### DevOps / Release Owner

- Sở hữu CI/CD, branch protection, secrets và release workflow.
- Cấu hình auto-merge, merge queue và required status checks.
- Cấu hình staging deployment từ `develop`.
- Cấu hình production build-test-deploy từ `main`.
- Theo dõi health check, smoke check, monitoring và rollback.
- Ghi deployment/release report.

DevOps không đồng nghĩa với "developer tự deploy từ máy cá nhân". Developer tập trung viết và kiểm thử code; DevOps/Release Owner sở hữu hệ thống triển khai.

### 2. Phân Công Theo Khu Vực

- `Anpham120`: Lead, Docs, DevOps, Testing, Integration, AI.
- `buidaoducanh1210`: Backend.
- `quanghieu1605`: Backend.
- `Tanh2k8-123`: Frontend.
- `totototototoads`: Frontend.

Nếu issue thay đổi người phụ trách hoặc phạm vi, ưu tiên thông tin mới nhất trong GitHub issue.

### 3. Vòng Đời Issue

1. Lead tạo hoặc cập nhật issue.
2. Issue ghi rõ mục tiêu, phạm vi file, điều không được chạm và tiêu chí hoàn thành.
3. Người phụ trách tạo branch issue từ `develop`.
4. Người phụ trách làm đúng scope.
5. Người phụ trách chạy build/test phù hợp.
6. Người phụ trách mở PR vào `develop`.
7. CI, required checks và ruleset tự kiểm tra PR.
8. Khi required checks đạt, PR vào merge queue.
9. Nếu merge queue pass, auto-merge hợp nhất vào `develop`.
10. Sau khi merge vào `develop`, staging deployment tự chạy nếu workflow đã cấu hình.
11. Issue chỉ được đóng khi có bằng chứng hoàn thành.

### 4. Release Và Production

Release production không đi thẳng từ issue branch.

Luồng đúng:

1. Các issue merge vào `develop`.
2. `develop` được kiểm tra trên staging.
3. Nếu staging health/smoke check đạt, workflow promote tạo hoặc cập nhật PR từ `develop` sang `main`.
4. Release PR phải pass required checks và merge queue.
5. Nếu queue pass, auto-merge hợp nhất vào `main`.
6. Sau khi code vào `main`, production build-test-deploy tự chạy.
7. Không có review/approval/deploy thủ công sau khi `main` nhận code.
8. DevOps kiểm tra health/smoke check và ghi báo cáo.

### 5. Báo Cáo Kết Quả Issue

Mỗi issue nên có báo cáo ngắn:

```text
### Báo cáo kết quả
- Issue:
- Branch:
- PR:
- Commit chính:
- Đã làm:
- File/chức năng đã thay đổi:
- Cách test:
- Bằng chứng build/test:
- Bằng chứng CI/CD nếu có:
- Có sửa ngoài scope không:
- Phần chưa làm / giới hạn:
```

### 6. Quy Tắc Khi Dùng AI Agent

AI agent chỉ là công cụ hỗ trợ người phụ trách issue. Người phụ trách vẫn chịu trách nhiệm cuối cùng về scope, test và báo cáo.

AI agent phải:

- Đọc issue và tài liệu liên quan trước khi sửa.
- Làm đúng phạm vi issue.
- Không tự ý sửa file ngoài scope.
- Không tự ý đổi API contract, enum, database schema hoặc shared type.
- Không commit secrets thật.
- Báo rõ test đã chạy và test chưa chạy.

AI agent không được:

- Tự nhận đã hoàn thành khi chưa có bằng chứng.
- Merge hoặc đóng issue khi chưa được yêu cầu.
- Revert thay đổi của người khác nếu chưa được phép.
- Tạo tài liệu mơ hồ chỉ để đủ hình thức.

### 7. Checklist Quality Gate

- [ ] PR đúng issue và đúng branch.
- [ ] Diff không vượt scope.
- [ ] Không có secrets thật.
- [ ] Frontend build pass nếu có sửa frontend.
- [ ] Backend restore/build/test pass nếu có sửa backend.
- [ ] CI pass hoặc có lý do rõ nếu CI chưa kích hoạt.
- [ ] Required checks và merge queue được cấu hình cho branch liên quan.
- [ ] Auto-merge không bỏ qua branch protection.
- [ ] DevOps evidence đầy đủ nếu PR liên quan deployment.
- [ ] Báo cáo issue/PR đủ thông tin.
- [ ] README không bị biến thành tài liệu nội bộ của team/agent.

---

## Mẫu báo cáo tuần

*(gộp từ `docs/WEEKLY_REPORT_TEMPLATE.md`)*

### 1. Thông Tin Chung

- Tuần:
- Thời gian:
- Milestone:
- Người báo cáo:

### 2. Mục Tiêu Tuần

- Mục tiêu chính:
- Issue cần hoàn thành:
- Phạm vi không làm trong tuần:

### 3. Công Việc Đã Hoàn Thành

| Issue | Người phụ trách | Branch | PR | Kết quả |
| --- | --- | --- | --- | --- |
| # |  |  |  |  |

### 4. Bằng Chứng Kỹ Thuật

- Build frontend:
- Build/test backend:
- CI run:
- Staging deploy:
- Production deploy:
- Health/smoke check:
- No-secrets check:

### 5. DevOps Và Release

- Branch protection đã áp dụng hay mới document:
- Trạng thái DevOps: kế hoạch đã chốt / đã triển khai thật:
- Required checks đã cấu hình:
- Merge queue đã cấu hình:
- Auto-merge đã cấu hình:
- `develop` có staging auto-deploy:
- Staging health/smoke check:
- Promote `develop` -> `main` tự động:
- `main` có production build-test-deploy tự động:
- Có review/approval/deploy thủ công sau khi `main` nhận code không:
- Rollback đã test hay mới document:
- Monitoring đã cấu hình hay mới document:

### 6. Vấn Đề Và Rủi Ro

- Lỗi phát sinh:
- Cách xử lý:
- Rủi ro còn lại:
- Việc cần Lead/DevOps quyết định:

### 7. Kế Hoạch Tuần Tiếp Theo

- Việc ưu tiên:
- Issue dự kiến:
- Kiểm thử cần bổ sung:
- Demo cần chuẩn bị:

### 8. Kết Luận

Tóm tắt ngắn gọn tiến độ, mức độ hoàn thành milestone và những bằng chứng quan trọng nhất.

---

## Vệ sinh repo

*(gộp từ `docs/REPO_HYGIENE.md`)*

### Mục tiêu

Repo chỉ chứa source code, migration, cấu hình mẫu và tài liệu cần thiết để review, build, test và deploy. File sinh tự động, log, output demo, secret thật và file scratch khi làm GitHub evidence không được commit.

### Quy tắc ignore

- Java/Gradle: không commit `backend-java/build/`, `.gradle/`.
- Frontend: không commit `node_modules/`, `dist/`, `*.tsbuildinfo`, `coverage/`.
- Python: không commit `__pycache__/`, `*.pyc`, `.pytest_cache/`, môi trường ảo.
- Local evidence/demo: không commit `output/`, `site-demo/`, `coursework/`, `tools/`, `commit_msg.txt`, `issue_comment.txt`, `pr*_body.txt`.
- Secrets: chỉ commit file mẫu như `.env.example`; không commit `.env`, `.env.*`, private key, token hoặc log chứa secret.

### Mock và demo data

- Production build không được phụ thuộc mock/localStorage để che lỗi backend thật.
- Demo data được phép tồn tại khi phục vụ dev/staging, nhưng phải được bật rõ bằng môi trường dev/staging hoặc seed/migration có kiểm soát.
- Nếu cần mock cho test hoặc story nội bộ, đặt trong test/dev-only path và ghi rõ cách bật. Không render payload debug hoặc JSON mẫu lên giao diện production.

### Checklist trước khi tạo PR

1. Chạy `git status --short --ignored` và xác nhận PR không chứa build output, log, secret hoặc file tạm.
2. Chạy scan cơ bản cho production UI: `rg -n "mock|payload|debug|JSON.stringify|localStorage" frontend/src backend/src`.
3. Chạy build/test liên quan trước khi merge.
