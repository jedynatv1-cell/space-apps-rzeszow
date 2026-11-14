// SessionStart: tell the agent which laptop it is on, what it owns and how far behind main it is.
// Output (stdout) is added to the session context, so keep it short.
import { loadRole, git, ROOT, existsSync } from "./lib.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const role = loadRole();
const out = ["[team setup]"];

if (role.error) {
  out.push(`Role: NOT SET (${role.error}). File-ownership guard is OFF. Run the /setup-laptop skill before editing.`);
} else {
  const ws = role.cfg.workstreams;
  out.push(`This is ${role.laptop} of ${role.n} laptops${role.isIntegrator ? " (COORDINATOR: runs the bot network, merges PRs, runs the shared server; writes NO feature code)" : ""}.`);
  out.push(
    role.isIntegrator
      ? "Rules: you are the hub. Check ListAgents, answer and relay [Lx→Ly] messages, keep docs/HANDOFF.md and the log current, merge only PRs that update docs."
      : `Rules: message ${role.cfg.integrator} (SendMessage, "[${role.laptop}→${role.cfg.integrator}] ...") when you start, get blocked and ship; talk to other laptops directly (cc ${role.cfg.integrator}); update docs in the same PR (CLAUDE.md "Team rules").`,
  );
  out.push(`Workstreams: ${role.streams.map((s) => `${s} ${ws[s].title}`).join("; ")}.`);
  out.push(`You may edit only: ${[...role.owns, ...role.cfg.everyone].join(", ") || "(nothing; read-only role)"}.`);
  if (role.branches.length) out.push(`Work on branch: ${role.branches.join(" or ")}.`);
  if (role.shouldBeStrong && role.machine === "light")
    out.push(`WARNING: ${role.laptop} needs a strong machine (Rust builds) but this one is marked "light". Swap roles with a strong laptop.`);
  if (!role.shouldBeStrong) out.push("Light machine: do not run cargo build/run here; use the shared server on L1 (http://<L1>:3000).");
}

git("fetch", "--quiet", "origin");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const counts = git("rev-list", "--left-right", "--count", "HEAD...origin/main");
const dirty = git("status", "--porcelain");
if (branch) {
  const [ahead, behind] = (counts ?? "0 0").split(/\s+/);
  out.push(`Git: on ${branch}, ${behind} behind / ${ahead} ahead of origin/main${dirty ? `, ${dirty.split("\n").length} uncommitted file(s)` : ", clean"}.`);
  if (Number(behind) > 0) out.push("Sync first: run the /sync skill.");
  if (branch === "main" && !role.isIntegrator) out.push("You are on main: switch to your feature branch before editing.");
}
if (!role.error && role.isIntegrator && !existsSync(join(ROOT, "data", "raw", "kernels", "de440s.bsp")))
  out.push("Kernels missing in data/raw/kernels: the shared server cannot start (HANDOFF §2).");

try {
  const log = readFileSync(join(ROOT, "docs", "COORDINATION.md"), "utf8");
  const rows = log.split("\n").filter((l) => /^\| (pon|wt|śr|czw|pt|sob|nd)\b/.test(l)).slice(0, 3);
  if (rows.length) out.push("Latest team log:", ...rows);
} catch {}

console.log(out.join("\n"));
