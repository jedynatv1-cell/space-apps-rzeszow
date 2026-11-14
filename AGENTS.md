# Agent instructions

This repo is worked on by several AI agents in parallel on up to 6 laptops (Claude Code on most, Google Antigravity on L3).

1. Read `CLAUDE.md`. Its project rules apply to every agent, not just Claude.
2. Read `docs/HANDOFF.md` (status) and `docs/COORDINATION.md` (plan, messaging, schedule).
3. **Ownership:** `.claude/roles.json` maps each laptop (L1..L6) to workstreams and the files it may edit. Antigravity on L3 owns only `web/**` (plus the log in `docs/COORDINATION.md`). Claude's guard hooks do not run in Antigravity, so follow this rule yourself.
4. Treat the JSON API contract (HANDOFF §5) as frozen: add fields, never rename or remove them. The frontend talks to the shared server on L1 (`http://<L1>:3000`); do not run `cargo` on light laptops.
5. Work on your branch (`feat/ui` for L3), push it and open a PR; only L1 merges to `main` after green CI. Never force-push, stash or reset.
6. At the end of every work session, add a row at the top of the log in `docs/COORDINATION.md` §9.
