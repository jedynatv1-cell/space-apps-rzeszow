# Agent instructions

This repo is worked on by several AI agents in parallel (two Claude Code chats and Google Antigravity).

1. Read `CLAUDE.md`. Its project rules apply to every agent, not just Claude.
2. Read `docs/HANDOFF.md` for current status and `docs/COORDINATION.md` for **which files and branch you own**.
3. Only edit the files your role owns. Treat the JSON API contract (HANDOFF §5) as frozen: add fields, never rename or remove them.
4. Before every commit: `cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test`. Merge to `main` only through a PR with green CI.
5. At the end of every work session, add a row at the top of the log in `docs/COORDINATION.md`.
