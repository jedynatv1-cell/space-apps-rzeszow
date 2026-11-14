---
name: verify
description: Run the checks CI runs (cargo fmt, clippy -D warnings, tests) and report pass/fail. Use before every commit or PR, and when asked whether the build is green. On light laptops it explains that checks run on L1/L2 or in CI instead.
---

# Verify

**Strong machine (Rust installed):**
```bash
cargo fmt --all && cargo clippy --all-targets -- -D warnings && cargo test
```
- Report: fmt ok/changed files, clippy warnings (file:line), test summary. If `matches_horizons_shackleton` printed SKIP, say that the kernels are missing (the Horizons check did not really run).
- Never weaken a test or silence a lint to get green; fix the cause or tell the user.

**Light machine (no Rust):** do not install Rust. For `web/` or docs-only changes there is nothing to compile: open the page against the shared server (`http://<L1>:3000`) and check the browser console for errors. Rust changes are verified by CI on the PR.

Also check: no file under `data/raw/` is staged (`git status`), and only files this laptop owns are changed (`.claude/roles.json`).
