import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("fixtures/sample-node-app");
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Dev Doctor",
  GIT_AUTHOR_EMAIL: "devdoctor@example.com",
  GIT_COMMITTER_NAME: "Dev Doctor",
  GIT_COMMITTER_EMAIL: "devdoctor@example.com",
};

function git(args) {
  execFileSync("git", args, { cwd: root, env, stdio: "inherit" });
}

mkdirSync(path.join(root, "src"), { recursive: true });

if (!existsSync(path.join(root, ".git"))) {
  git(["init"]);
  git(["add", "-A"]);
  git(["commit", "-m", "Initial sample project"]);
}

writeFileSync(path.join(root, "src", "uncommitted.js"), "export const pending = true;\n");
console.log("Sample project is ready and has an uncommitted file.");
