# Lunar Landing Site Navigator — NASA Space Apps 2026 (Rzeszów)

**Start here:** read `docs/HANDOFF.md` — current status, what is verified, next steps, pitfalls.
Hackathon deadline: **Sun 15 Nov 2026, 23:59 CET** (submission on spaceappschallenge.org).

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
