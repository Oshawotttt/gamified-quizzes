#!/usr/bin/env node
// Install the md-to-quiz-json Claude Code skill.
// Usage: npx -y github:Oshawotttt/gamified-quizzes [--project | --dir <skills dir>]
//   default    ~/.claude/skills/md-to-quiz-json  (every project)
//   --project  ./.claude/skills/md-to-quiz-json  (current project only)
//   --dir      <skills dir>/md-to-quiz-json
// Running it again replaces the installed copy with this version.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = "md-to-quiz-json";
const repo = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: npx -y github:Oshawotttt/gamified-quizzes [--project | --dir <skills dir>]");
  process.exit(0);
}
let skillsDir = join(homedir(), ".claude", "skills");
if (args.includes("--project")) skillsDir = resolve(".claude", "skills");
const dirAt = args.indexOf("--dir");
if (dirAt !== -1) {
  if (!args[dirAt + 1]) {
    console.error("--dir needs a path");
    process.exit(1);
  }
  skillsDir = resolve(args[dirAt + 1]);
}

const target = join(skillsDir, SKILL);
const versionFile = join(target, "VERSION");
const previous = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : existsSync(target) ? "unknown" : null;

// Replace the whole folder so files removed in a newer version do not linger.
rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, "lib"), { recursive: true });
cpSync(join(repo, ".claude", "skills", SKILL), target, { recursive: true });
// The validator uses the same rules as the bank: copy them, do not duplicate them.
for (const f of ["bank.js", "import.js"]) cpSync(join(repo, "js", f), join(target, "lib", f));
writeFileSync(versionFile, `${version}\n`);

if (previous === null) console.log(`installed ${SKILL} ${version} at ${target}`);
else if (previous === version) console.log(`reinstalled ${SKILL} ${version} at ${target}`);
else console.log(`updated ${SKILL} ${previous} -> ${version} at ${target}`);
console.log("Restart Claude Code, then run /md-to-quiz-json <Answers .md file>");
