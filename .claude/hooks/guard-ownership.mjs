// PreToolUse (Edit|Write|MultiEdit|NotebookEdit): block edits to files this laptop does not own.
// Exit 2 = block; stderr is shown to the agent. Exit 0 = allow.
import { loadRole, ownersOf, matches, repoRel, readStdin } from "./lib.mjs";

const input = await readStdin();
const ti = input.tool_input ?? {};
const rel = repoRel(ti.file_path ?? ti.notebook_path ?? ti.path);
if (!rel) process.exit(0); // outside the repo (scratchpad, plans): not our business

const role = loadRole();
if (role.error || role.override) process.exit(0); // not configured yet: do not get in the way

if (rel.startsWith("data/raw/")) {
  console.error(`Blocked: ${rel} is in data/raw/ (large, git-ignored datasets). Do not edit or create files there.`);
  process.exit(2);
}

const allowed = [...role.owns, ...role.cfg.everyone];
if (allowed.some((g) => matches(g, rel))) process.exit(0);

const owners = ownersOf(role.cfg, rel);
if (!owners.length) {
  console.error(
    `Blocked: ${rel} is not assigned to any workstream yet. New files must be added to a workstream's "owns" list in ` +
      `.claude/roles.json first (only the integrator ${role.cfg.integrator} edits that file; ask the user or message ${role.cfg.integrator}).`,
  );
  process.exit(2);
}
const who = owners.join(", ");
console.error(
  [
    `Blocked: ${rel} belongs to ${who}; this laptop is ${role.laptop} (owns: ${role.owns.join(", ") || "nothing"}).`,
    `Do not edit it. Either ask the user, or send the owner a request with SendMessage (format in docs/COORDINATION.md §5).`,
    `If the user explicitly wants this edit here, they can set "override": true in .claude/role.local.json.`,
  ].join("\n"),
);
process.exit(2);
