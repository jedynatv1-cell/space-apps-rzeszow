# Lunar Landing Site Navigator — NASA Space Apps 2026 (Rzeszów)

**Start here:** read `docs/HANDOFF.md` — current status, what is verified, next steps, pitfalls.
Deadlines: **local judging submission Sun 15 Nov 2026, 12:59 CET** (Rzeszów); global Sun 23:59 CET.
Team of up to 6 laptops sharing one Claude quota: roles, file ownership and branches live in `.claude/roles.json`; this laptop's role in `.claude/role.local.json` (git-ignored). The session-start hook tells you which laptop you are and what you may edit; guard hooks block edits to other laptops' files and unsafe git. Skills: `/setup-laptop`, `/sync`, `/verify`, `/ship`. Plan and messaging rules: `docs/COORDINATION.md`. Demo plan: `docs/DEMO-PLAN.md`.
Quota: no subagents or workflows; keep one long-running chat per laptop.

## Team rules (binding for every bot)
1. **L1 is the coordinator, not a developer.** The L1 chat only runs the bot network: relays and answers
   messages, keeps the log and docs current, assigns work, merges green PRs, restarts the shared server.
   It writes no feature code (no `src/`, `web/`, `data/` edits). Terrain (W1) and metrics/API (W2) are on L2.
2. **Bots talk to each other, and always loop in L1.** Use `ListAgents` + `SendMessage` with the
   `[Lx→Ly]` format (COORDINATION §5). Send L1 a one-line status when you start a task, when you are
   blocked, and when you ship. Need something from another laptop's files? Message that laptop (cc L1);
   never edit its files. L1's chat is the hub: questions about who does what go there.
3. **Docs stay current in the same PR.** Any change to behaviour, the API contract, setup or status
   updates the matching doc in the same PR: `docs/HANDOFF.md` §4/§5 (status, API) via a message to L1
   (it owns HANDOFF), `README.md`/`docs/` you own directly, plus a row at the top of the log
   (COORDINATION §9). A PR without a doc update must say in its body why none was needed. L1 rejects
   PRs that break this rule.

## What it is
Rust (axum + ANISE) backend + static `web/` frontend. For a lunar site and date it computes Sun and
Earth azimuth/elevation vs the local horizon → solar power and direct-to-Earth (DTE) windows, and lets
users compare sites/dates quickly. Focus: lunar south pole. Challenge text: `docs/CHALLENGE-OFFICIAL.md`.

## Commands
- `cargo run` → http://localhost:3000 (needs NAIF kernels in `data/raw/kernels/`, see HANDOFF §2)
- `cargo test` — Horizons-pinned ephemeris test auto-skips when kernels are missing (as in CI)
- Before every commit: `cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test` (CI enforces this)

## Code map
- `src/ephem.rs` — Sun/Earth topocentric az/el (ANISE, DE440s). Verified vs JPL Horizons to 0.001°. Keep the test passing.
- `src/horizon.rs` — horizon mask (currently smooth sphere) + visible-disk fraction.
- `src/dem.rs` — LOLA polar DEM reader: **stub, next task** (label params in HANDOFF §6).
- `src/metrics.rs` — track sampling, sunlight/DTE windows, sunset/Earthset.
- `src/api.rs` — `/api/health`, `/api/sites`, `/api/track` (contract in HANDOFF §5).
- `data/sites.json` — curated landing sites; Artemis regions are approximate proxies.
- `docs/RESEARCH.md` — deep research (APIs, datasets, physics, MVP, task split). `docs/SUBMISSION.md` — verified rules.

## Conventions
- East-positive longitude −180..180; elevation relative to the 1737.4 km sphere tangent plane (same as Horizons); azimuth clockwise from north.
- Use `MOON_ME_DE440_ME421_FRAME` in ANISE — `MOON_ME_FRAME` fails with these kernels.
- `data/raw/` (kernels, DEMs, ~620 MB) is git-ignored: never commit it.
- Team docs in `docs/` are in Polish; code, comments, commit messages and anything for the submission are in English.
- Submission materials must be in English; AI ("SI") use must be disclosed; no NASA logos in generated content.
- Commit messages end with the `Co-Authored-By` trailer when Claude authors them.
