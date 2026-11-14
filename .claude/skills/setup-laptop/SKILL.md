---
name: setup-laptop
description: One-time setup of this computer for the team - pick its laptop role (L1..L6), check tools, data and Remote Control. Use when the session-start note says the role is not set, or when the user says this is a new/other laptop.
---

# Set up this laptop

Goal: this checkout knows which laptop it is, has what that role needs, and can talk to the other laptops.

1. **Team size.** Read `.claude/roles.json`. If `"laptops"` is 0, ask the user how many team laptops there are (2–6) and tell them only the integrator (L1) should commit that change; do not guess.
2. **Which laptop is this.** Ask the user which L-number this computer is (show the layout for the team size from `roles.json`, with each laptop's workstreams). L1 and L2 must be the STRONG machines (Rust builds, shared server); L3+ are LIGHT.
3. Write `.claude/role.local.json` (git-ignored), e.g. `{"laptop": "L3", "machine": "light"}`. Never commit it.
4. **Check tools** (report, don't install without asking): `git --version`, `node --version` (hooks need Node), `gh auth status`. Strong machines also: `cargo --version`. Light machines: no Rust needed.
5. **Data.** L1 (and L2 if it runs its own server for testing) needs `data/raw/kernels/` (3 files) and optionally `data/raw/dem/`, with the exact sizes from `docs/HANDOFF.md` §2. Light machines need no `data/raw/`.
6. **Branch.** Switch to the role's branch from `roles.json` (create it from `origin/main` if missing): `git fetch origin && git switch -c <branch> origin/main` or `git switch <branch>`.
7. **Remote Control + agent messages** (user settings, so tell the user rather than editing silently, and only edit `~/.claude/settings.json` if they say yes):
   - `"remoteControlAtStartup": true`: every session on this laptop is reachable from the others.
   - `"crossSessionInbound": "accept"`: messages from the team's other sessions are delivered. Use only because all laptops share one account.
8. Add/update this laptop's row in the device table in `docs/COORDINATION.md` §2, then tell the user the setup is done and what the next session will show at start.
