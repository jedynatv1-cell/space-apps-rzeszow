# Endgame handoff (Sun 15 Nov 2026, from 09:30 CET)

Written for **Antigravity (or any agent) continuing the work on its own, one laptop at a time**.
No bot-to-bot messaging is needed: everything a laptop needs is in its section below.
Coordination happens through **PRs to `main` + one row in the log** (`docs/COORDINATION.md` §9).

**How to use this file:** find your laptop (L1…L6) in §4, do its tasks **top to bottom**, stop at
the time limits. Read §1–§3 first (5 minutes). Code, comments, commits and anything for judges are
in **English**.

---

## 1. Hard deadlines (CET, Rzeszów)

| Time | What |
|---|---|
| **10:00** | **Feature freeze.** After this, `main` takes only bug fixes, docs and the one exception in L2/L3 below. |
| 10:00–11:45 | Record and edit the ≤ 30 s video (L6), finish the slides (L5), finish the page texts (L4). |
| **12:15** | Final check on the live server + incognito link test (L1). Repo made **public** (user decides, §2). |
| **12:40** | **Submit for Judging** on the Space Apps site (user). Local deadline is **12:59**. |
| 13:00 | Local pitch: live demo + backup video. |

## 2. Rules that are easy to break

1. **Privacy:** no emails, IPs, machine hostnames (except `laptop-l1`), user names or local paths
   (`C:\Users\…`, `/home/…`) in any file, PR, video or slide. Grep before every PR.
   The commit-author email in git history is a **pending user decision** (A: fresh squashed public
   repo, B: keep). Do not rewrite history yourself.
2. **AI disclosure** is mandatory ("Use of AI" section; see `docs/PPO.md` §Use of AI too).
   No NASA logos in generated content. Team member under 18: the video is **screen recording
   only** (no faces, no voices except synthetic, marked as AI). Video **≤ 30 s** or **≤ 7 slides**,
   or the project is out of global judging.
3. **Every PR updates its docs** (or says why not) and adds a log row at the top of
   `docs/COORDINATION.md` §9. If two PRs collide in that log: keep all rows, delete the markers.
4. **File ownership** is in `.claude/roles.json` (guard hooks enforce it on the Claude laptops).
   Stay inside your laptop's files.
5. **Rust PRs** must pass `cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test`
   (CI enforces it). `data/raw/` (kernels, DEMs) is never committed.
6. `/api/track`, `/api/compare`, `/api/best_nearby` are **validated** (JPL Horizons to 0.001°,
   Gläser ridge within 1 pp). Never change their numbers after the freeze.

## 3. State at 09:30 (what exists and works)

- **App:** http://laptop-l1:3000 (Tailscale; `http://localhost:3000` on L1). Pages:
  `index.html` (Explore: sky plot, horizon panorama, timeline, verdict, countdown, best spot,
  launch slips, CSV export, embedded 3D Moon panel; Compare: `?view=compare`) and `solar.html`
  (3D Moon + solar system; shaded landing zones; hover card = "Why here" + live 30-day conditions).
- **API** (contract: `docs/HANDOFF.md` §5): `/api/health`, `/api/sites`, `/api/track`
  (+`&format=csv`), `/api/compare` (sites or dates mode), `/api/best_nearby`.
- **Merged PRs:** #1–#46. Latest: #42/#43/#45/#46 landing zones + hover card, #44 3D panel on
  index.html, #41 neural-net model files (`data/ppo/`, `docs/PPO.md`).
- **Validation numbers for the pitch:** `docs/VALIDATION.md` (Horizons ≤ 0.00005° on test cases;
  Gläser Connecting Ridge 91.1 vs 92 %, 95.7 vs 95.6 %).
- **Demo gold:** Malapert Massif → "Best spot within 500 m" raises Sun visibility from ~47 % to
  ~99.7 % (quote whatever the screen shows; it depends on the date window). Cabeus B shows
  "Poor site" for the next 30 days (date-dependent lighting: a good teaching moment).
- **Not done:** `/api/moon_predict` (neural-net Moon predictor, L2), its UI hook (L3), the video
  (L6), the slides (L5), final page texts (L4). The `feat/ui-charts` redesign never appeared:
  **cancelled** unless a PR exists before 10:00.

---

## 4. Per-laptop tasks

### L1: coordinator + shared server (strong machine)
Owns: `Cargo.toml`, `src/main.rs`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/HANDOFF.md`,
`docs/ENDGAME-HANDOFF.md`, `docs/COORDINATION.md`, `.claude/**`, `.github/**`. Writes no feature code.

1. **Keep the server up** (it stops now and then). From a checkout of `origin/main`:
   `cargo run --release` (needs `data/raw/kernels/` + both DEMs, `docs/HANDOFF.md` §2).
   Check: `curl http://localhost:3000/api/health` → `"ok":true, "sites":29`, both `dem_products`.
   **Warm it after every restart** (the first best-spot call is ~15 s, then fast):
   `curl "http://localhost:3000/api/best_nearby?lat=-85.99&lon=-0.5&start=2026-12-01T00:00:00Z&days=30&step_min=60&radius_m=500&grid_m=50"`
2. **Merge green PRs** (squash), then move the server checkout to the new `main`
   (`git checkout --detach origin/main`; web files go live without a restart, Rust changes need a restart).
3. When a PR changes the API, update `docs/HANDOFF.md` §4/§5 in the same or a follow-up PR.
4. **~09:30:** set `"laptops": 6` in `.claude/roles.json` when L6 is in (W5 media moves to L6).
5. **12:15 final check:** open every page on http://laptop-l1:3000 and the 4 demo deep links (§5),
   check the browser console has no errors, run the best-spot demo once (warm), check the README
   renders on GitHub, and grep the repo for privacy leaks:
   `git grep -n -I -E "@gmail|@outlook|192\.168\.|100\.[0-9]+\.[0-9]+\.[0-9]+|C:\\\\Users|/home/" -- . ':!Cargo.lock'`
   (the only allowed hit is the `192.168.1.23` example in `docs/START-PC.md`; delete it too if in doubt).
6. Ask the user for the A/B email decision (§2.1), then the user flips the repo to public and submits.

### L2: backend (strong machine), the neural-net Moon predictor
Owns: `src/metrics.rs`, `src/api.rs`, `src/ephem.rs`, `src/site.rs`, `src/ppo.rs`, `data/ppo/**`,
`docs/PPO.md`. Branch: `feat/ppo` (already has `mod ppo;` in `main.rs`).

**Freeze exception:** this is an additive, isolated endpoint, so it may merge **until 11:00** if it
passes the test vectors. If it is not green by 11:00, **drop it**: nothing else depends on it.

State of `feat/ppo` (at aff82a6): `src/ppo.rs` has ecliptic↔equatorial rotation (obliquity
84381.448″), a two-body RK4 integrator, an MLP forward pass with SiLU, and 3 unit tests.
`ephem.rs` has ANISE J2000 helpers (geocentric Moon). Missing:

1. `git merge origin/main` (brings `data/ppo/*.json` from PR #41).
2. Load the model JSON (`data/ppo/moon_nn_ppo30d.json` = default "ppo", `moon_nn_primary.json` =
   "base"; layers 10→512→512→512→6, weights row-major `[out][in]`, float32 values, plus input/output
   normalisation and float64 action scaling; read the exact layout from the JSON keys and
   `docs/PPO.md`). Load lazily on first request (7.8 MB each), cache in a `OnceLock`.
3. The step: state (r km, v km/s, ecliptic J2000, TDB) + Sun direction (analytic Meeus) → 10 inputs →
   MLP → correction; next state = two-body RK4 over 6 h (24 substeps) + correction. Autoregressive.
4. **Test against `data/ppo/test_vectors.json`:** 5 single-step cases (`state_in`, `sun_km`,
   `obs`, `kepler_only`, `state_out`) must match to ~1e-6 relative; the 120-step rollout from
   JD 2460310.5 TDB must match its stated final state. Use `kepler_only` to check RK4 alone first.
5. Endpoint (contract is **fixed**, the UI already uses it):
   `GET /api/moon_predict?start=YYYY-MM-DDTHH:MM[Z]&days=<0..120, float>&model=ppo|base`
   → `{model, start, target, predicted:{distance_km, ra_deg, dec_deg, ecl_lon_deg, ecl_lat_deg},
   de440:{same 5 fields}, error_km, error_deg}`. Initial state from ANISE DE440s at `start`;
   whole 6 h steps, then a final partial two-body step for the remainder. Errors: JSON 400 like
   the other endpoints. Do **not** touch `/api/track`.
6. Add the endpoint line to the HANDOFF §5 text in the PR body (L1 copies it), log row, PR.

### L3: frontend
Owns: `web/**`. Branch: `feat/ui-*`.

1. **When `/api/moon_predict` is on `main`:** add one line to `web/index.html`
   (`<script src="predict.js?v=<new>"></script>`, next to the `embed3d.js` line), bump `?v=`,
   test live: slider 0–120 days, model toggle (PPO default), table predicted vs DE440, no console
   errors. `predict.js` is already in `main` (unhooked). If the endpoint is not there by 11:00, skip.
2. If the UI changed visibly since PR #33, retake the README screenshots (`web/img/analysis.jpg`,
   `compare.jpg`, `moon3d.jpg`, 800 px wide) and PR them (L1 merges).
3. After 10:00: only bug fixes reported by L5/L6. Keep every DOM id and URL parameter
   (`?site=`, `?view=compare`, `?focus=slips|pano|sky`, `?days=`): the recording script uses them.

### L4: research, accuracy, page texts (light machine)
Owns: `data/sites.json`, `docs/SUBMISSION.md`, `docs/CHALLENGE.md`, `docs/RESEARCH.md`,
`docs/VALIDATION.md`. Branch: `feat/content`. Deadline for the PR: **11:45**.

1. Fill the "Teksty strony projektu" part of `docs/SUBMISSION.md` with final English texts for the
   7 Space Apps fields, starting from `docs/ENDGAME-PLAN.md` §2. Check every number against
   `docs/VALIDATION.md` and the live app. Use this user-approved wording for problem + audience:
   > Near the lunar south pole the Sun and Earth stay within a few degrees of the horizon, so one
   > crater ridge or a launch slip of a few days can cut solar power or Direct-to-Earth (DTE) radio.
   > JPL Horizons assumes a smooth sphere; lunar GIS portals are too slow for scenario testing.
   > Lunar Landing Site Navigator combines JPL DE440 ephemerides (verified to 0.001°) with NASA LRO
   > LOLA terrain (40 m/px) to compute true horizon masks and sunlight/DTE windows in seconds,
   > compare sites, simulate launch slips (+1/+7/+30 d) and find the best-lit spot within 500 m.
   > For (1) mission planners and commercial/university lunar teams (Expert mode: trade studies,
   > slip re-planning, mast height, CSV export) and (2) students, educators and enthusiasts
   > (Public mode + 3D view: historic and upcoming Artemis/CLPS sites, why polar lighting and
   > Earth libration are hard).
2. **Use of AI:** list Claude Code (code, docs, research), Antigravity/Gemini (frontend design),
   and the neural-net Moon predictor (two-body RK4 + MLP correction, PPO fine-tuned; shown next to
   DE440 for comparison only), but **only if** `/api/moon_predict` is merged; otherwise leave it out.
3. Verify the Gläser 2014 citation marked `[VERIFY]` in `docs/ENDGAME-PLAN.md` (likely Icarus 243,
   78–90); fix or remove it.
4. NASA Data + References: LOLA polar DEMs (PDS), DE440s + Moon PCK (NAIF), JPL Horizons
   (validation), NASA SVS CGI Moon Kit (3D imagery), PGDA (reference), JAXA SLIM / ISRO
   Chandrayaan-3 (sites), all libraries (Rust: axum, anise, memmap2, serde, tokio; JS: three.js).

### L5: QA + slides (light machine)
Owns: nothing in code (report bugs to the owner as a short note in the log or a PR comment);
slides live outside the repo (Google Slides), the link goes to the user.

1. **QA retest on http://laptop-l1:3000** (incognito, desktop + 375 px phone width), console open:
   Explore with Shackleton / Malapert / Connecting Ridge; best spot at Malapert; launch slips;
   CSV export; Compare (`?view=compare`); `solar.html`: hover a candidate zone (card with
   "Why here" + conditions, never hidden under the left panel), Fly to site, the 3D panel on
   `index.html` → "Analyse this site". Write each bug as one line: page, steps, expected, actual.
2. **≤ 7 slides** (they are also the local pitch): 1 title (team, project, no photos of people),
   2 problem (polar Sun/Earth near the horizon), 3 solution (screenshot of Explore), 4 how it works
   (DE440 + LOLA → horizon mask → windows), 5 validation table (`docs/VALIDATION.md`),
   6 demo moments (best spot +50 pp, launch slip, 3D zones), 7 who it is for + repo link.
   English only, no NASA logos, AI use noted on the last slide.

### L6: video (strong machine, arrives Sunday)
Owns: `docs/DEMO-PLAN.md`, `scripts/**`. Branch: `feat/demo`.

1. Setup: clone, `.claude/role.local.json` = `{"laptop":"L6","machine":"strong"}`, open
   http://laptop-l1:3000 (Tailscale: `.claude/scripts/tailscale-join.ps1`). No Rust build needed.
2. Record (screen only, 1920×1080): either by hand or with a Playwright script
   (`scripts/demo/record.mjs` + `scenes.json`, plan in `docs/DEMO-PLAN.md` §2). Scenes, ≤ 30 s total:
   | s | Picture | Caption (EN) |
   |---|---|---|
   | 0–2 | Title card | *Team <name> · NASA Space Apps Rzeszów 2026* |
   | 2–6 | `solar.html`, fly to the south pole, hover a shaded landing zone | *At the lunar south pole, the Sun and Earth skim the horizon.* |
   | 6–12 | Explore at Shackleton/Malapert: sky plot + panorama with real terrain | *Real LOLA terrain decides power and comms.* |
   | 12–17 | Launch slip +7 d: numbers change | *Launch slipped a week? See the impact instantly.* |
   | 17–23 | Malapert → "Best spot within 500 m" (pre-warmed!) | *Move 500 m, gain sunlight.* |
   | 23–27 | Compare 3 Artemis regions | *Validated against NASA JPL Horizons to 0.001°.* |
   | 27–30 | End card + repo URL | *For mission planners, educators and everyone curious.* |
3. Edit in DaVinci (captions only, free-licence music listed in References, AI voice/music marked),
   export 1080p H.264 MP4, check ≤ 30 s, upload to YouTube as **Unlisted**, give the link to the user
   by **11:45**. Backup: keep the MP4 locally for the pitch.

---

## 5. Demo deep links

- `http://laptop-l1:3000/index.html?site=Malapert` (then click "Best spot within 500 m")
- `http://laptop-l1:3000/index.html?site=Shackleton&focus=pano`
- `http://laptop-l1:3000/index.html?site=Shackleton&focus=slips`
- `http://laptop-l1:3000/index.html?view=compare`
- `http://laptop-l1:3000/solar.html`

(Site names match on substring; check the exact names in `/api/sites` if one does not resolve.)

## 6. Where things are

`docs/HANDOFF.md` (setup, API contract §5), `docs/VALIDATION.md` (accuracy), `docs/SUBMISSION.md`
(rules + page texts), `docs/DEMO-PLAN.md` (schedule, recording), `docs/ENDGAME-PLAN.md` (final plan
and copy-paste texts), `docs/PPO.md` (neural-net model), `docs/COORDINATION.md` §9 (log).
