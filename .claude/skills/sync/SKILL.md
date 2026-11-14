---
name: sync
description: Bring this laptop's checkout up to date with the team - fetch, rebase the role's branch on origin/main, read new log entries and messages. Use at the start of work, after another laptop says it merged something, or when the session note says the checkout is behind main.
---

# Sync with the team

1. `git fetch origin` and `git status -sb`. If there are uncommitted changes, commit them to this laptop's branch first (only files this role owns); never stash, reset or discard.
2. On the role's feature branch: `git merge origin/main` (merge, not rebase: the branch is already pushed and force-push is blocked). On a conflict: stop, show the user the conflicting files and who owns them (`.claude/roles.json`); do not resolve another laptop's file on your own.
3. The integrator (L1) on `main`: `git pull --ff-only`.
4. Read the top 5 rows of the log in `docs/COORDINATION.md` §9 and summarize anything that affects this laptop (API contract changes, new fields, who is waiting on whom).
5. Strong machines whose code changed: `cargo build` so the next run is quick. Light machines skip this.
6. Report in 3 lines: branch and how far behind/ahead of main, what is new for this role, and what to do next.
