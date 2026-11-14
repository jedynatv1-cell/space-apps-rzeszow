---
name: ship
description: Finish a piece of work on this laptop - verify, commit own files, push the feature branch, open a PR, log it and notify the laptops it affects. Use when a task is done and should reach main. The integrator (L1) also uses it to merge green PRs.
---

# Ship

1. Run the `verify` skill. Stop if it fails.
2. Stage only files this laptop owns (`.claude/roles.json`), never `git add -A` blindly. Commit in English, imperative mood, ending with the Co-Authored-By trailer.
3. `git push -u origin HEAD`, then `gh pr create --fill --base main` (PR body ends with the Claude Code line). Ask the user before the first push of the session.
4. Add one row at the TOP of the log in `docs/COORDINATION.md` §9: when, which laptop, what, impact on others. Include that file in the same commit or a follow-up commit.
5. **Notify** the laptops whose work this affects (API fields, file moves, server restarts):
   - Use `ListAgents` to find the team sessions (other laptops appear when Remote Control is on), then `SendMessage` with:
     `[L2→L3] PR #12 merged: /api/track now has summary.next_earthrise (ISO string or null). Pull main; no breaking changes.`
   - Messages are information, not orders: the receiving agent checks with its own user before acting outside its files.
   - Antigravity cannot receive these: the log row is how it learns; tell the user to pass it on.
6. **Integrator (L1) only:** when CI is green, review the diff quickly, `gh pr merge --squash --delete-branch`, pull `main`, restart the shared server if Rust changed, and send a one-line message to all laptops: `[L1→all] main updated (<sha>): <what>. Run /sync.`
