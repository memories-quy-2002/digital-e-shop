# Stage 1: duyệt rerun CI qua CLI

**Ngày:** 2026-10-05
**Trạng thái:** Người dùng đã duyệt thiết kế trong phiên ngày 2026-10-05; kế hoạch chi tiết tại [Stage 1 implementation plan](../plans/2026-10-05-stage1-cli-flaky-rerun.md). Approval này dành cho thiết kế/kế hoạch, không mở live rerun hoặc quyền sửa protected paths.
**Phạm vi đã thống nhất:** Người dùng duyệt trên CLI khi Loop phát hiện failed checks. Stage 1 chỉ rerun lỗi được xác nhận flaky; sửa code thuộc Stage 2.
**Nhánh tài liệu:** `feature/stage1-cli-approval-plan`.

## Mục tiêu

Maintainer có thể đọc đề xuất rerun, xác thực GitHub, duyệt một lần chạy cụ thể và theo dõi kết quả. Hệ thống từ chối khi bằng chứng, quyền, approval hoặc ngân sách không hợp lệ.

## Hiện trạng đã đối chiếu

- `docs/loop-engineering/phase-2-pr-babysitter-runbook.md` định nghĩa Stage 1 là flaky rerun, không phải điều phối issue hoặc sửa code.
- `scripts/loop/pr-babysitter-cli.mjs` đã có command `rerun-flaky`, kiểm tra TTY, quyết định `retry-check`, budget, approval và refresh PR.
- `scripts/loop/github-auth-provider.mjs` đã có GitHub App device flow, trusted numeric user IDs, capability `actions:rerun` và approval opaque, hết hạn, dùng một lần.
- `scripts/loop/github-actions-write.mjs` đã có `createGitHubActionsWriteHost(options)` và `rerunFailedJobs({ host, decision, target, approval })`, kiểm tra evidence, reserve CI attempt và chống trùng trước POST.
- `scripts/loop/pr-babysitter-host.mjs` là host Stage 0; chưa mở trusted Stage 1 entrypoint. Required workflow source SHA hiện chưa được attested.
- `.agent/policy/stop-conditions.yml`: `maxFlakyRetries=3`, `maxWallClockSeconds=1800`, `ciRunLimit=null`. Adapter rerun từ chối budget CI không hữu hạn. Vì vậy chưa thể bật live rerun chỉ bằng cách nối CLI.
- `scripts/loop/classify-failure.mjs` có phân loại flaky dựa trên evidence pass rồi fail cùng revision. Một failed check đơn lẻ không đủ để gọi là flaky.
- Một cron sweep hoàn tất chỉ chứng minh quét PR và enqueue thành công. Không dùng `last_completed_at` để chứng minh queue consumer, Check Run publication hoặc điều kiện promotion đã hoàn tất.

## Những cách đã cân nhắc

| Cách | Ưu điểm | Hạn chế | Quyết định |
| --- | --- | --- | --- |
| Trusted CLI, maintainer duyệt từng rerun | Tận dụng auth/adapter hiện có; phù hợp yêu cầu fresh TTY approval | Maintainer phải mở CLI | Chọn cho Stage 1 |
| Worker tự rerun | Không cần mở CLI | Xung đột yêu cầu TTY approval hiện tại; cần một thiết kế approval và policy khác | Không thuộc thiết kế này |
| Thêm dashboard hoặc dịch vụ approval | Có giao diện riêng | Tăng hệ thống, lưu trữ và cơ chế xác thực | Chưa cần trong Stage 1 |

## Trải nghiệm người dùng

1. Maintainer thấy failed check trên PR của GitHub; Stage 0 vẫn quan sát và có thể cập nhật report neutral khi đủ evidence.
2. Maintainer mở CLI để lấy snapshot mới của PR, xem check fail và phân loại lỗi. CLI tự đọc lại GitHub; không tin kết quả cũ trong Check Run hoặc D1 như một authorization.
3. CLI báo một trong các trạng thái: đang chờ evidence/CI; có thể đề xuất rerun flaky; lỗi do code cần Stage 2; lỗi infrastructure/protected/ambiguous cần kiểm tra thủ công.
4. Với đề xuất đủ điều kiện, maintainer gọi `rerun-flaky`. CLI xác thực user qua GitHub và kiểm tra trusted approver IDs.
5. Prompt hiển thị repo/PR, branch, SHA tuple, tested SHA, workflow/run/attempt, toàn bộ failed job IDs được rerun, lý do flaky, số lượt còn lại và thời hạn approval. Người dùng xác nhận hoặc hủy.
6. Host đọc lại evidence và SHA tuple, kiểm tra budget, lấy token riêng cho `actions:rerun`, kiểm tra lại và reserve attempt trước POST.
7. Khi GitHub chấp nhận, CLI báo `submitted`/`wait`, không báo CI pass. Lệnh inspect tiếp theo theo dõi attempt mới; chỉ evidence GitHub mới xác nhận kết quả.

Các lệnh sau là giao diện đề xuất, chưa phải command có thể dùng hiện tại:

```powershell
node scripts/loop/pr-babysitter-stage1-host.mjs inspect --repo memories-quy-2002/digital-e-shop --pr 123
node scripts/loop/pr-babysitter-stage1-host.mjs rerun-flaky --repo memories-quy-2002/digital-e-shop --pr 123
```

Không có popup terminal tự động hoặc notification app trong phạm vi đầu tiên. GitHub PR Checks là nơi xem tín hiệu; CLI là nơi review và duyệt. Report neutral có thể bổ sung hướng dẫn CLI nhưng không chứa approval hay token.

## Kiến trúc và ranh giới quyền

- Giữ Hosted Stage 0 Worker, cron, D1 và Queue làm phần quan sát/report. Không đưa `actions:write` vào Worker hoặc token publisher.
- Thêm trusted Stage 1 host riêng trong Node.js, dùng lại `runPrBabysitterCli`, auth provider, PR client và Actions write adapter.
- Host chỉ cho phép `inspect` và `rerun-flaky`. Nó không mở `begin-repair`, `validate-repair`, push hoặc merge.
- Dùng local state hiện có dưới `.loop/pr/` và `.loop/state/`; không sao chép raw logs, prompts hay credentials từ Cloudflare vào state.
- Canonical policy lấy từ revision đáng tin cậy theo host contract, không lấy approval IDs, workflow allowlist hoặc budget từ PR đang chạy.
- API write duy nhất là `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` theo adapter hiện có.
- Endpoint rerun-failed-jobs chạy lại toàn bộ failed jobs và dependent jobs của run. Host phải review toàn bộ workflow/job graph và kiểm tra tập failed jobs khớp approval; không coi danh sách một vài job đã duyệt là quyền rerun cả run. [GitHub REST API](https://docs.github.com/en/rest/actions/workflow-runs#re-run-failed-jobs-from-a-workflow-run).

## Hai prerequisite phải review riêng

### 1. Bằng chứng workflow source SHA

Host hiện từ chối `workflow_source_sha_unattested`. Không được sửa thành trusted chỉ vì run có đúng tên, path hoặc head SHA.

Trước khi nối live write, phải review cơ chế attestation cho tuple repository ID, workflow path/ref/source SHA, run ID/attempt và tested SHA; cơ chế phải xác minh nguồn phát hành độc lập với dữ liệu PR. Workflow/reusable workflow/local action thay đổi trong PR phải bị từ chối. Nếu chưa có nguồn attestation đáng tin cậy, CLI chỉ inspect và trả refusal; không có fallback mở quyền.

Việc chọn và triển khai nguồn attestation là deliverable review đầu tiên. Phải chứng minh bằng fixtures rằng dữ liệu giả, artifact PR tự khai, sai issuer, sai SHA, sai run/attempt và evidence thiếu đều bị từ chối trước khi thông qua thiết kế nguồn đó.

### 2. Ngân sách CI hữu hạn

Đề xuất pilot: `ciRunLimit=2` cho mỗi host session; `maxFlakyRetries=3` giữ nguyên cho PR scope. Giới hạn hiệu lực là phần nhỏ hơn của các budget còn lại, với `maxWallClockSeconds=1800`.

Đây là đề xuất thay đổi canonical policy, không phải giá trị đã được duyệt. PR policy cần review/merge riêng; implementation và pilot bắt đầu ở revision mới sau review. Không thay policy rồi chạy live trong cùng run. State thiếu, hỏng hoặc mismatch không được tự reset để có thêm budget.

## Allowlist và approval

- Chỉ workflow/job đã được review, không dùng secrets, protected environments hoặc write-capable token trong job được rerun.
- Audit mọi reusable workflow và local action dependency trước khi allowlist. Quyền hoặc secrets không rõ thì refuse.
- Approval binding: repository ID, PR number, base/head/merge SHA, tested SHA, capability, workflow path/ID, run ID, attempt và failed job IDs.
- Approval cần fresh TTY, user ID đáng tin cậy, thời hạn hữu hạn và single-use. Không cung cấp `--yes`, chat approval, input JSON approval hoặc noninteractive auto-approve.
- PR đóng, đổi SHA, workflow đổi, job set đổi, thiếu evidence hoặc sai allowlist thì cần quan sát lại; approval trước đó không được chuyển sang target mới.
- Timeout hoặc mất kết nối sau POST được giữ là attempt đã submit không rõ kết quả. Kiểm tra GitHub trước khi có bất kỳ đề xuất retry tiếp theo; không tự gửi lại POST.

## Lộ trình triển khai đề xuất

### Task 1: baseline và promotion evidence

**Đọc:** Stage 0/Phase 2 runbooks, `Wiki/concepts/loop-engineering.md`.
**Tạo:** `docs/loop-engineering/stage1-readiness.md`.

- [ ] Ghi ít nhất 10 quan sát PR failed/pending đại diện theo gate hiện tại; phân biệt live evidence với fixtures, không thay thế live gate bằng fixtures nếu chưa review policy.
- [ ] Xác minh queue processing và Check Run publication trên PR pilot, thay vì suy luận từ cron success.
- [ ] Ghi 0 stale-SHA actionable decisions và 0 protected/infrastructure misclassifications trong tập đã kiểm tra.
- [ ] Chỉ lưu IDs, SHA, classification, status và reason codes; không lưu secrets, raw logs hoặc review bodies.

### Task 2: review allowlist và workflow-source attestation

**Đọc/tái sử dụng:** `scripts/loop/github-actions-write.mjs`, `scripts/loop/github-pr-client.mjs`.
**Dự kiến tạo sau approval:** `scripts/loop/workflow-source-attestation.mjs`, `scripts/loop/__tests__/workflow-source-attestation.test.mjs`.

- [ ] Chốt nguồn trust và hợp đồng `verifyWorkflowSourceAttestation({ identity, run, snapshot }) -> Promise<boolean>` trong thiết kế riêng.
- [ ] Review allowlist đúng workflow ID/path/ref/source SHA và job names; audit dependencies và privilege.
- [ ] Viết negative fixtures và kiểm chứng callback từ chối mọi metadata tự khai không có attestation.
- [ ] Giữ live rerun đóng cho đến khi nguồn trust được review. Nếu cần sửa CI để phát hành attestation, tạo PR riêng cho chính xác các workflow bị ảnh hưởng.

### Task 3: canonical budget review

**Phạm vi cần approval riêng:** `.agent/policy/stop-conditions.yml` và tài liệu liên quan.

- [ ] Review đề xuất CI-run limit hữu hạn và cách tạo LoopState session.
- [ ] Merge policy qua PR riêng, rồi bắt đầu implementation run mới từ revision đã review.
- [ ] Kiểm chứng session budget, PR flaky budget, elapsed-time budget và lỗi state fail closed.

### Task 4: trusted Stage 1 host

**Dự kiến tạo:** `scripts/loop/pr-babysitter-stage1-host.mjs`, `scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`.
**Tái sử dụng:** `pr-babysitter-cli.mjs`, `github-auth-provider.mjs`, `github-pr-client.mjs`, `github-actions-write.mjs`, `state.mjs`, `pr-state.mjs`.

- [ ] Nối trusted repository config, policy, approver allowlist, attestation verifier và persisted budgets.
- [ ] Nối adapters theo `runPrBabysitterCli({ argv, trustedHost, io })`; `io.isTTY` lấy từ terminal thật.
- [ ] Từ chối commands ngoài inspect/rerun-flaky trước khi đọc write credentials.
- [ ] Viết fixtures cho revoked approver, non-TTY, missing attestation, stale tuple và đúng một request hợp lệ.

### Task 5: prompt, notification và outcome

**Dự kiến sửa:** CLI/auth prompt đúng phạm vi trong `scripts/loop/pr-babysitter-cli.mjs`, `scripts/loop/github-auth-provider.mjs`.
**Dự kiến tạo:** `docs/loop-engineering/stage1-cli-runbook.md`.

- [ ] Prompt hiển thị đầy đủ target và budget trước approval, có lựa chọn hủy.
- [ ] Failed deterministic check hiển thị cần xử lý Stage 2; không đề xuất rerun nếu classification không flaky.
- [ ] Sau POST hiển thị submitted/wait và run identity để maintainer kiểm tra; không mô tả HTTP accepted là CI pass.
- [ ] Ghi hướng dẫn inspect/rerun và reason codes. Chỉ thay report Stage 0 sau review riêng nếu cần thêm command hint.

### Task 6: verification và review

- [ ] Test stale tuple trước approval, sau approval và sau token mint; mọi case gửi 0 POST.
- [ ] Test expired/replayed/forged approval, nonallowlisted failed job, workflow change, secrets/privilege unknown, exhausted/null budgets.
- [ ] Test hai invocation cùng attempt chỉ reserve/submit một lần và timeout không gây auto-resubmit.
- [ ] Chạy targeted suites và toàn bộ loop unit tests từ clean checkout:

```powershell
node --test scripts/loop/__tests__/github-auth-provider.test.mjs scripts/loop/__tests__/github-actions-write.test.mjs scripts/loop/__tests__/pr-babysitter-cli.test.mjs scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs scripts/loop/__tests__/workflow-source-attestation.test.mjs
node --test scripts/loop/__tests__/*.test.mjs
pnpm --dir scripts/loop/hosted/cloudflare test
pnpm --dir scripts/loop/hosted/cloudflare typecheck
```

- [ ] Full fixed verifier và required external CI phải pass ở đúng revision/fingerprint trước handoff; không bypass khi evidence unavailable.
- [ ] Review diff không có credentials, broadened write routes, auto-merge hoặc policy bypass.
- [ ] Update `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`, `Wiki/log.md` khi triển khai làm thay đổi kiến trúc thực tế.

### Task 7: activation và live pilot

- [ ] Kiểm tra đủ promotion evidence, reviewed policy, approved App permissions và attestation source.
- [ ] Thay đổi GitHub App installation permissions là operation riêng cần maintainer duyệt; Worker Stage 0 vẫn dùng token read/report theo capability cũ.
- [ ] Chạy một pilot trên same-repository non-main PR với eligible workflow, fresh TTY approval và hữu hạn budget.
- [ ] Xác nhận attempt mới trên GitHub, target/SHA đúng, không submit trùng và không vượt budget.
- [ ] Thu tối thiểu 10 bounded rerun decisions hoặc representative fixtures theo gate Stage 2 hiện tại; không dùng kết quả này để tự bật sửa code.

## Acceptance criteria

- **AC-01:** Inspect đưa ra classification và lý do từ snapshot mới; không mặc định failed check = flaky.
- **AC-02:** Chỉ maintainer được xác thực trong trusted allowlist có thể duyệt; non-TTY và approval giả/expired/replayed bị từ chối.
- **AC-03:** Approval khớp toàn bộ target, SHA tuple, tested SHA và toàn bộ tập failed jobs mà endpoint sẽ rerun.
- **AC-04:** Attestation và reviewed workflow/job allowlist là prerequisite bắt buộc; thiếu một trong hai gửi 0 POST.
- **AC-05:** Thay đổi PR/workflow/jobs sau approval hoặc token mint làm operation refuse.
- **AC-06:** Budget reserve và idempotency xảy ra trước POST; tối đa một submission mỗi action attempt, timeout không tự submit lại.
- **AC-07:** Thông báo phân biệt đề xuất, submitted, pending, passed và failed; accepted POST không được báo passed.
- **AC-08:** Không có repair/push/merge/deploy authority trong Stage 1 host; Worker không nhận Actions-write token.
- **AC-09:** State/telemetry chỉ có bounded metadata và không có token, PEM, raw logs hoặc prompt history.
- **AC-10:** Promotion gate và required external checks có evidence; tài liệu kế hoạch không được coi là authorization cho live operation.

## Handoff và review

Việc hiện tại chỉ tạo tài liệu low-risk dưới `docs/**`. Các path implementation `scripts/loop/**`, policy `.agent/policy/**` và mọi CI workflow là high-risk theo canonical policy; approval cho CLI rerun tương lai không tự cấp phép sửa các path này.

User đã review và duyệt bản thiết kế, đồng thời yêu cầu viết kế hoạch chi tiết, commit theo Conventional Commit/commit-lint và push nhánh hiện tại. Không triển khai, thay App permissions, thay policy hoặc chạy live rerun trong lượt viết kế hoạch này.
