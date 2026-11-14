// Shared helpers for the project hooks. Plain Node (no deps), works on Windows/macOS/Linux.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Resolved role of this laptop, or a reason why there is none. */
export function loadRole() {
  const cfg = readJson(join(ROOT, ".claude", "roles.json"));
  if (!cfg) return { error: "missing .claude/roles.json" };
  const local = readJson(join(ROOT, ".claude", "role.local.json")) ?? {};
  const laptop = process.env.CLAUDE_LAPTOP || local.laptop;
  const n = String(cfg.laptops ?? 0);
  if (!cfg.layouts?.[n]) return { cfg, error: `team size not set: put "laptops": 2-6 in .claude/roles.json` };
  if (!laptop) return { cfg, error: `this laptop has no role: create .claude/role.local.json with {"laptop": "L1".."L${n}"}` };
  const streams = cfg.layouts[n][laptop];
  if (!streams) return { cfg, error: `${laptop} is not in the ${n}-laptop layout (L1..L${n})` };
  const owns = streams.flatMap((s) => cfg.workstreams[s]?.owns ?? []);
  const branches = streams.map((s) => cfg.workstreams[s]?.branch).filter(Boolean);
  return {
    cfg,
    laptop,
    n,
    streams,
    owns,
    branches,
    override: local.override === true,
    machine: local.machine,
    shouldBeStrong: (cfg.strong ?? []).includes(laptop),
    isIntegrator: laptop === cfg.integrator,
  };
}

/** Which laptops own `rel` in the current layout. */
export function ownersOf(cfg, rel) {
  const layout = cfg.layouts?.[String(cfg.laptops)] ?? {};
  return Object.entries(layout)
    .filter(([, streams]) => streams.some((s) => (cfg.workstreams[s]?.owns ?? []).some((g) => matches(g, rel))))
    .map(([l]) => l);
}

/** Minimal glob: exact path, "dir/**" prefix, "*.ext" in one dir. Paths use forward slashes. */
export function matches(glob, rel) {
  if (glob.endsWith("/**")) return rel === glob.slice(0, -3) || rel.startsWith(glob.slice(0, -2));
  if (glob.includes("*")) {
    const re = new RegExp("^" + glob.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
    return re.test(rel);
  }
  return rel === glob;
}

/** Repo-relative forward-slash path, or null when outside the repo. */
export function repoRel(p) {
  if (!p) return null;
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  const rel = relative(ROOT, abs).split("\\").join("/");
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
}

export function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 8000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

export async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  try {
    return JSON.parse(data || "{}");
  } catch {
    return {};
  }
}

export { existsSync };
