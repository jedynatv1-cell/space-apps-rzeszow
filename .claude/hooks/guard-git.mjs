// PreToolUse (Bash|PowerShell): stop git commands that break the shared structure.
// Exit 2 = block; stderr is shown to the agent. Exit 0 = allow.
import { loadRole, git, readStdin } from "./lib.mjs";

const input = await readStdin();
const cmd = String(input.tool_input?.command ?? "");
if (!/\bgit\b/.test(cmd)) process.exit(0);

const role = loadRole();
const integrator = !role.error && role.isIntegrator;
const branch = git("rev-parse", "--abbrev-ref", "HEAD");

const rules = [
  [/\bgit\s+push\b[^\n;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, "force-push rewrites shared history"],
  [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s+\.|restore\s+\.)/, "discards uncommitted work (maybe another agent's)"],
  [/\bgit\s+stash\b/, "stash hides changes from the other agents; commit to your branch instead"],
  [/\bgit\s+(rebase|add)\s+-i\b/, "interactive git does not work in agent sessions"],
  [/\bgit\s+add\b[^\n;&|]*(data[\/\\]raw(?![\/\\]kernels)|\s-f\b|\s--force\b)/, "data/raw (DEMs, ~580 MB) is git-ignored on purpose; only data/raw/kernels/ is committed"],
  [/\bgit\s+commit\b[^\n;&|]*--no-verify\b/, "hooks must not be skipped"],
];
for (const [re, why] of rules) {
  if (re.test(cmd)) {
    console.error(`Blocked git command: ${why}.\nCommand: ${cmd}\nAsk the user if this is really intended.`);
    process.exit(2);
  }
}

// Does any `git push` in the command update main? Explicit refspecs decide; a bare push (or HEAD) uses the current branch.
const pushesMain = [...cmd.matchAll(/\bgit\s+push\b([^\n;&|]*)/g)].some(([, rest]) => {
  const refs = rest.trim().split(/\s+/).filter((t) => t && !t.startsWith("-")).slice(1); // drop the remote name
  if (refs.some((r) => /(^|:)(refs\/heads\/)?main$/.test(r))) return true;
  return (refs.length === 0 || refs.includes("HEAD")) && branch === "main";
});
if (pushesMain && !role.error && !integrator) {
  console.error(
    `Blocked: only the integrator (${role.cfg?.integrator ?? "L1"}) updates main. Push your feature branch and open a PR:\n` +
      `  git push -u origin HEAD && gh pr create --fill`,
  );
  process.exit(2);
}
process.exit(0);
