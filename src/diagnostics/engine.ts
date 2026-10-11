import type {
  DiagnosticFinding,
  DiagnosticStatus,
  FixSuggestion,
  Health,
  PackageJsonSnapshot,
  ProjectMeta,
  ProjectSnapshot,
  ScanResult,
  ScanSummary,
} from "../domain/types";
import { DOCS } from "../domain/types";
import { compareEnvKeys } from "./env";
import { parseGitPorcelain } from "./git";
import { detectLockfiles, packageManagerLabel } from "./lockfile";
import { redactList, redactSecrets } from "./sanitize";
import { compareNodeVersion } from "./version";

export function createFinding(
  finding: Omit<DiagnosticFinding, "evidence" | "explanation" | "recommendedAction"> & {
    evidence: string[];
    explanation: string;
    recommendedAction: string;
  },
): DiagnosticFinding {
  return {
    ...finding,
    explanation: redactSecrets(finding.explanation),
    recommendedAction: redactSecrets(finding.recommendedAction),
    evidence: redactList(finding.evidence.filter((line) => line.trim().length > 0)),
  };
}

export function collectRuleFindings(rules: Array<() => DiagnosticFinding[]>): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  for (const rule of rules) {
    try {
      findings.push(...rule());
    } catch (error) {
      findings.push(
        createFinding({
          id: `rule-failed-${findings.length}`,
          category: "runtime",
          severity: "warning",
          status: "unknown",
          title: "A diagnostic check failed",
          explanation: "This check hit an unexpected error. The rest of the scan still ran.",
          evidence: [error instanceof Error ? error.message : "Unknown error"],
          recommendedAction: "Scan the project again. If it keeps failing, check that the folder is readable.",
        }),
      );
    }
  }
  return findings;
}

export function summarizeFindings(findings: DiagnosticFinding[]): ScanSummary {
  return {
    passed: findings.filter((finding) => finding.status === "pass").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    errors: findings.filter((finding) => finding.severity === "error").length,
    infos: findings.filter((finding) => finding.severity === "info" && finding.status !== "pass").length,
  };
}

export function healthFromSummary(summary: ScanSummary): Health {
  if (summary.errors > 0) return "unhealthy";
  if (summary.warnings > 0) return "attention";
  return "healthy";
}

function declaredDependencies(pkg: PackageJsonSnapshot): string[] {
  return [...pkg.dependencyNames, ...pkg.devDependencyNames];
}

function openDocs(id: string, label: string, url: string, whatChanges: string): FixSuggestion {
  return {
    id,
    label,
    kind: "open-url",
    url,
    whatChanges,
    sideEffects: "No project files are modified.",
  };
}

function copyCommand(id: string, label: string, commandText: string, whatChanges: string): FixSuggestion {
  return {
    id,
    label,
    kind: "copy",
    commandText,
    whatChanges,
    sideEffects: "Nothing runs until you paste the command into a terminal yourself.",
  };
}

function nodeFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const node = snapshot.node;
  if (!node.available) {
    const timedOut = (node.error ?? "").toLowerCase().includes("timed out");
    if (timedOut) {
      return [
        createFinding({
          id: "node-timeout",
          category: "runtime",
          severity: "warning",
          status: "unknown",
          title: "Node.js version check timed out",
          explanation: "Dev Doctor started node --version, but it did not finish before the timeout.",
          evidence: [node.error ?? "The check timed out."],
          recommendedAction: "Run node --version in a terminal. If it hangs, fix that Node.js install and scan again.",
        }),
      ];
    }
    return [
      createFinding({
        id: "node-missing",
        category: "runtime",
        severity: "error",
        status: "fail",
        title: "Node.js is not installed",
        explanation: "This project needs Node.js, and the node command was not found on PATH.",
        evidence: [node.error ?? "node was not found on PATH."],
        recommendedAction: "Install Node.js, reopen the terminal Dev Doctor was launched from, and scan again.",
        fix: openDocs(
          "open-node-docs",
          "Open Node.js downloads",
          DOCS.nodeDownload,
          "Opens the official Node.js download page.",
        ),
      }),
    ];
  }

  if (!node.version) {
    return [
      createFinding({
        id: "node-version-unknown",
        category: "runtime",
        severity: "warning",
        status: "unknown",
        title: "Node.js version could not be read",
        explanation: "The node command exists, but Dev Doctor could not read a version from it.",
        evidence: [node.error ?? "node --version returned no version."],
        recommendedAction: "Run node --version in a terminal and confirm it prints a version such as v22.14.0.",
      }),
    ];
  }

  return [
    createFinding({
      id: "node-installed",
      category: "runtime",
      severity: "info",
      status: "pass",
      title: "Node.js is installed",
      explanation: "The node command is available and reported a version.",
      evidence: [`Installed version: ${node.version}`],
      recommendedAction: "No action needed for the Node.js install itself.",
    }),
  ];
}

function toolFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];
  const detection = detectLockfiles(snapshot.lockfiles);

  if (!snapshot.npm.available) {
    findings.push(
      createFinding({
        id: "npm-missing",
        category: "runtime",
        severity: detection.primary === "npm" || detection.managers.length === 0 ? "warning" : "info",
        status: "fail",
        title: "npm is not available",
        explanation: "The npm command was not found on PATH. Node.js projects often use it to install dependencies.",
        evidence: [snapshot.npm.error ?? "npm was not found on PATH."],
        recommendedAction: "Install Node.js, which includes npm, or fix PATH so the npm binary can be found.",
        fix: openDocs("open-npm-docs", "Open npm install docs", DOCS.npmInstall, "Opens the npm install documentation."),
      }),
    );
  } else {
    findings.push(
      createFinding({
        id: "npm-installed",
        category: "runtime",
        severity: "info",
        status: "pass",
        title: "npm is available",
        explanation: "The npm command responded with a version.",
        evidence: [`npm version: ${snapshot.npm.version ?? "unknown"}`],
        recommendedAction: "No action needed.",
      }),
    );
  }

  const pnpmRequired = detection.managers.includes("pnpm");
  if (snapshot.pnpm.available) {
    findings.push(
      createFinding({
        id: "pnpm-installed",
        category: "runtime",
        severity: "info",
        status: "pass",
        title: "pnpm is available",
        explanation: "The pnpm command responded with a version.",
        evidence: [`pnpm version: ${snapshot.pnpm.version ?? "unknown"}`],
        recommendedAction: "No action needed.",
      }),
    );
  } else if (pnpmRequired) {
    findings.push(
      createFinding({
        id: "pnpm-missing",
        category: "runtime",
        severity: "error",
        status: "fail",
        title: "pnpm is required but not installed",
        explanation: "A pnpm lockfile is present, but the pnpm command was not found.",
        evidence: [snapshot.pnpm.error ?? "pnpm was not found on PATH.", "Lockfile: pnpm-lock.yaml"],
        recommendedAction: "Install pnpm, then scan again before installing dependencies.",
        fix: openDocs("open-pnpm-docs", "Open pnpm installation docs", DOCS.pnpmInstall, "Opens the pnpm installation page."),
      }),
    );
  }

  return findings;
}

function enginesFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const pkg = snapshot.packageJson;
  if (!pkg.present || pkg.readError || pkg.parseError) return [];

  if (pkg.enginesNodeError) {
    return [
      createFinding({
        id: "engines-unreadable",
        category: "runtime",
        severity: "warning",
        status: "unknown",
        title: "engines.node could not be evaluated",
        explanation: "package.json declares engines, but Dev Doctor cannot compare it reliably.",
        evidence: [pkg.enginesNodeError],
        recommendedAction: "Set engines.node to a semver range string such as \">=20\".",
        fix: openDocs(
          "open-engines-docs",
          "Open engines docs",
          DOCS.nodeEngines,
          "Opens the Node.js documentation for the engines field.",
        ),
      }),
    ];
  }

  const comparison = compareNodeVersion(snapshot.node.version, pkg.enginesNode);
  if (comparison.status === "no-requirement") {
    return [
      createFinding({
        id: "engines-missing",
        category: "runtime",
        severity: "info",
        status: "unknown",
        title: "No Node.js version requirement declared",
        explanation: "package.json does not set engines.node, so Dev Doctor cannot tell which Node.js release this project expects.",
        evidence: ["engines.node is absent."],
        recommendedAction: "Add an engines.node range if the project depends on a specific Node.js version.",
      }),
    ];
  }
  if (comparison.status === "uncertain") {
    return [
      createFinding({
        id: "engines-uncertain",
        category: "runtime",
        severity: "warning",
        status: "unknown",
        title: "Node.js requirement could not be compared",
        explanation: comparison.reason,
        evidence: [
          pkg.enginesNode ? `engines.node: ${pkg.enginesNode}` : "engines.node was empty.",
          snapshot.node.version ? `Installed version: ${snapshot.node.version}` : "Installed version: unavailable",
        ],
        recommendedAction: "Use a semver range in engines.node, and confirm node --version prints a version.",
      }),
    ];
  }
  if (comparison.status === "satisfied") {
    return [
      createFinding({
        id: "engines-satisfied",
        category: "runtime",
        severity: "info",
        status: "pass",
        title: "Installed Node.js matches engines.node",
        explanation: "The installed Node.js version satisfies the range declared in package.json.",
        evidence: [`Installed version: ${comparison.installed}`, `Required range: ${comparison.range}`],
        recommendedAction: "No action needed.",
      }),
    ];
  }
  return [
    createFinding({
      id: "engines-mismatch",
      category: "runtime",
      severity: "error",
      status: "fail",
      title: "Installed Node.js does not match engines.node",
      explanation: "The project declares a Node.js range, and the version on PATH is outside that range. Dev Doctor will not change your Node.js install automatically.",
      evidence: [`Installed version: ${comparison.installed}`, `Required range: ${comparison.range}`],
      recommendedAction: "Install a Node.js version inside the declared range, then scan again.",
      fix: copyCommand(
        "copy-node-switch",
        "Copy recommendation",
        `Installed ${comparison.installed} does not satisfy engines.node (${comparison.range}). Switch Node.js with your version manager, then re-scan.`,
        "Copies a reminder. It does not install or switch Node.js.",
      ),
    }),
  ];
}

function packageJsonFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const pkg = snapshot.packageJson;
  if (!pkg.present) {
    return [
      createFinding({
        id: "package-json-missing",
        category: "dependencies",
        severity: "error",
        status: "fail",
        title: "package.json was not found",
        explanation: "Dev Doctor looks for a Node.js project by reading package.json. This folder does not have one, so dependency checks cannot run.",
        evidence: ["package.json is missing."],
        recommendedAction: "Choose a Node.js project folder, or add a package.json if this is a new project.",
      }),
    ];
  }
  if (pkg.readError) {
    return [
      createFinding({
        id: "package-json-unreadable",
        category: "dependencies",
        severity: "error",
        status: "fail",
        title: "package.json could not be read",
        explanation: "The file exists, but Dev Doctor could not read it. No contents were stored.",
        evidence: [pkg.readError],
        recommendedAction: "Check the file permissions and scan again.",
      }),
    ];
  }
  if (pkg.parseError) {
    return [
      createFinding({
        id: "package-json-malformed",
        category: "dependencies",
        severity: "error",
        status: "fail",
        title: "package.json is malformed",
        explanation: "The file is not valid JSON, so dependency names and engines.node were not used.",
        evidence: [pkg.parseError],
        recommendedAction: "Fix the JSON syntax in package.json and scan again.",
      }),
    ];
  }
  return [
    createFinding({
      id: "package-json-present",
      category: "dependencies",
      severity: "info",
      status: "pass",
      title: "package.json is readable",
      explanation: "Dev Doctor parsed the project manifest.",
      evidence: [`Name: ${pkg.name ?? snapshot.folderName}`],
      recommendedAction: "No action needed.",
    }),
  ];
}

function lockfileFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  if (!snapshot.packageJson.present || snapshot.packageJson.parseError || snapshot.packageJson.readError) {
    return [];
  }
  const detection = detectLockfiles(snapshot.lockfiles);
  if (detection.lockfiles.length === 0) {
    return [
      createFinding({
        id: "lockfile-missing",
        category: "dependencies",
        severity: "info",
        status: "unknown",
        title: "No package manager lockfile found",
        explanation: "Without a lockfile, Dev Doctor cannot tell whether this project uses npm, pnpm, Yarn, or Bun.",
        evidence: ["Looked for package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml, yarn.lock, bun.lock, and bun.lockb."],
        recommendedAction: "Install dependencies with one package manager so it can write a lockfile.",
      }),
    ];
  }
  if (detection.inconsistent) {
    return [
      createFinding({
        id: "lockfiles-inconsistent",
        category: "dependencies",
        severity: "warning",
        status: "fail",
        title: "Multiple package manager lockfiles",
        explanation: "More than one package manager has a lockfile here. Installing with the wrong one can rewrite dependencies. Dev Doctor will not pick one for you.",
        evidence: detection.lockfiles.map((file) => `Found ${file}`),
        recommendedAction: "Keep the lockfile for the package manager you actually use, and remove the others only after you have reviewed them.",
        fix: copyCommand(
          "copy-lockfile-note",
          "Copy recommendation",
          `Lockfiles found: ${detection.lockfiles.join(", ")}. Choose one package manager before installing.`,
          "Copies a reminder. It does not delete lockfiles.",
        ),
      }),
    ];
  }
  return [
    createFinding({
      id: "lockfile-detected",
      category: "dependencies",
      severity: "info",
      status: "pass",
      title: `Package manager detected: ${detection.primary}`,
      explanation: "A single package manager lockfile identifies how dependencies were last installed.",
      evidence: detection.lockfiles.map((file) => `Found ${file}`),
      recommendedAction: "Use that package manager for future installs.",
    }),
  ];
}

function dependencyFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const pkg = snapshot.packageJson;
  if (!pkg.present || pkg.readError || pkg.parseError) return [];
  const names = declaredDependencies(pkg);
  const detection = detectLockfiles(snapshot.lockfiles);
  const findings: DiagnosticFinding[] = [];

  if (snapshot.dependencyCheckNote) {
    findings.push(
      createFinding({
        id: "dependency-check-limited",
        category: "dependencies",
        severity: "warning",
        status: "unknown",
        title: "Dependency check is incomplete",
        explanation: snapshot.dependencyCheckNote,
        evidence: ["Dev Doctor did not modify the project."],
        recommendedAction: "Fix the filesystem issue and scan again.",
      }),
    );
  }

  if (!snapshot.nodeModulesExists) {
    if (names.length === 0) {
      findings.push(
        createFinding({
          id: "node-modules-absent-empty",
          category: "dependencies",
          severity: "info",
          status: "pass",
          title: "No dependencies declared",
          explanation: "package.json has no dependencies or devDependencies, and node_modules is absent.",
          evidence: ["node_modules was not found."],
          recommendedAction: "No install is required unless you add dependencies.",
        }),
      );
      return findings;
    }

    const evidence = [
      "node_modules was not found.",
      `${names.length} direct dependencies are declared.`,
      "This check does not install packages.",
    ];
    const canExecute =
      !detection.inconsistent &&
      ((detection.primary === "npm" && snapshot.npm.available) ||
        (detection.primary === "pnpm" && snapshot.pnpm.available));

    let fix: FixSuggestion | undefined;
    if (canExecute && detection.primary === "npm") {
      fix = {
        id: "npm-install",
        label: "Install with npm",
        kind: "execute",
        action: "npm-install",
        whatChanges: "Runs npm install in this project and creates node_modules from package.json and the npm lockfile.",
        sideEffects:
          "May update package-lock.json. Lifecycle scripts are not run because the command includes --ignore-scripts. Native addons that need a postinstall build will stay unbuilt until you run a full install yourself.",
      };
    } else if (canExecute && detection.primary === "pnpm") {
      fix = {
        id: "pnpm-install",
        label: "Install with pnpm",
        kind: "execute",
        action: "pnpm-install",
        whatChanges: "Runs pnpm install in this project and creates node_modules from package.json and pnpm-lock.yaml.",
        sideEffects:
          "May update pnpm-lock.yaml. Lifecycle scripts are not run because the command includes --ignore-scripts.",
      };
    } else {
      const lines = ["npm install --ignore-scripts", "pnpm install --ignore-scripts"];
      fix = copyCommand(
        "copy-install",
        "Copy install commands",
        lines.join("\n"),
        "Copies install commands. Dev Doctor will not run them while the package manager is ambiguous or missing.",
      );
    }

    findings.push(
      createFinding({
        id: "node-modules-missing",
        category: "dependencies",
        severity: "warning",
        status: "fail",
        title: "Dependencies are not installed",
        explanation:
          "node_modules is missing, so declared packages are not available locally. This is a filesystem check, not a registry lookup.",
        evidence,
        recommendedAction: canExecute
          ? `Install dependencies with ${detection.primary}. Review the command before confirming.`
          : "Choose one package manager and install dependencies yourself. Dev Doctor will not guess.",
        fix,
      }),
    );
    return findings;
  }

  if (snapshot.missingDependencyNames.length === 0) {
    findings.push(
      createFinding({
        id: "dependencies-present",
        category: "dependencies",
        severity: "info",
        status: "pass",
        title: "Direct dependencies look installed",
        explanation:
          "Each direct dependency and devDependency has a folder in node_modules. This is a heuristic: it does not prove the installed version matches the lockfile, and it ignores optionalDependencies.",
        evidence: [
          "node_modules exists.",
          names.length === 0 ? "No direct dependencies are declared." : `Checked ${names.length} direct names.`,
        ],
        recommendedAction: "No action needed from this check.",
      }),
    );
    return findings;
  }

  const shown = snapshot.missingDependencyNames.slice(0, 20);
  findings.push(
    createFinding({
      id: "dependencies-missing",
      category: "dependencies",
      severity: "warning",
      status: "fail",
      title: "Some direct dependencies are missing from node_modules",
      explanation:
        "These names are listed in package.json but do not have a node_modules folder. The check is only a heuristic. Hoisted, bundled, or globally installed packages can be false alarms, and optionalDependencies are not flagged.",
      evidence: [
        ...shown.map((name) => `Missing folder: ${name}`),
        snapshot.missingDependencyNames.length > shown.length
          ? `${snapshot.missingDependencyNames.length - shown.length} more names were omitted.`
          : "",
      ],
      recommendedAction: "Reinstall dependencies with the project's package manager after you confirm which lockfile is authoritative.",
    }),
  );
  return findings;
}

function configurationFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const env = snapshot.env;
  const findings: DiagnosticFinding[] = [];
  if (env.note) {
    findings.push(
      createFinding({
        id: "env-note",
        category: "configuration",
        severity: "info",
        status: "unknown",
        title: "Environment example files overlap",
        explanation: env.note,
        evidence: [env.exampleFile ? `Compared ${env.exampleFile}.` : "No example file was selected."],
        recommendedAction: "Keep one example file so the expected variable names stay obvious.",
      }),
    );
  }
  if (env.exampleReadError) {
    findings.push(
      createFinding({
        id: "env-example-unreadable",
        category: "configuration",
        severity: "warning",
        status: "unknown",
        title: "The environment example file could not be read",
        explanation: "Dev Doctor did not compare variable names because the example file could not be read. Values are never displayed.",
        evidence: [env.exampleReadError],
        recommendedAction: "Check permissions on the example file and scan again.",
      }),
    );
    return findings;
  }
  if (!env.exampleFile) {
    findings.push(
      createFinding({
        id: "env-example-missing",
        category: "configuration",
        severity: "info",
        status: "unknown",
        title: "Required environment variables cannot be inferred",
        explanation:
          "No .env.example or .env.sample file was found. Dev Doctor will not guess which variables the app needs, and it does not read values from .env for display.",
        evidence: ["Looked for .env.example and .env.sample."],
        recommendedAction: "Add an example file that lists variable names with empty values.",
      }),
    );
    return findings;
  }
  if (env.exampleUnparsedLines > 0) {
    findings.push(
      createFinding({
        id: "env-example-partial",
        category: "configuration",
        severity: "warning",
        status: "unknown",
        title: "Some example environment lines were skipped",
        explanation: "A few lines in the example file did not look like NAME=value entries. Those lines were not stored.",
        evidence: [`Unparsed lines: ${env.exampleUnparsedLines}`, `Example file: ${env.exampleFile}`],
        recommendedAction: "Use one KEY=value pair per line in the example file.",
      }),
    );
  }
  if (env.envReadError) {
    findings.push(
      createFinding({
        id: "env-unreadable",
        category: "configuration",
        severity: "warning",
        status: "unknown",
        title: ".env could not be read",
        explanation: "The local env file exists but could not be read. No values were stored.",
        evidence: [env.envReadError],
        recommendedAction: "Check permissions on .env and scan again.",
      }),
    );
    return findings;
  }

  const comparison = compareEnvKeys(env.exampleKeys, env.envFileExists ? env.envKeys : null);
  if (!env.envFileExists) {
    findings.push(
      createFinding({
        id: "env-file-missing",
        category: "configuration",
        severity: comparison.missing.length > 0 ? "warning" : "info",
        status: comparison.missing.length > 0 ? "fail" : "unknown",
        title: ".env is missing",
        explanation: `${env.exampleFile} lists expected variable names, but there is no .env file. Dev Doctor will not create one.`,
        evidence:
          comparison.missing.length > 0
            ? comparison.missing.map((key) => `Missing key: ${key}`)
            : ["The example file did not contain any variable names."],
        recommendedAction: "Create .env locally and set the missing names. Keep the real values out of git.",
      }),
    );
    return findings;
  }
  if (env.envUnparsedLines > 0) {
    findings.push(
      createFinding({
        id: "env-partial",
        category: "configuration",
        severity: "info",
        status: "unknown",
        title: "Some .env lines were skipped",
        explanation: "Lines that were not valid variable names were ignored. Their contents were not stored.",
        evidence: [`Unparsed lines: ${env.envUnparsedLines}`],
        recommendedAction: "Use NAME=value lines for variables you want Dev Doctor to compare.",
      }),
    );
  }
  if (comparison.missing.length > 0) {
    findings.push(
      createFinding({
        id: "env-keys-missing",
        category: "configuration",
        severity: "warning",
        status: "fail",
        title: "Environment file is missing declared names",
        explanation: `${env.exampleFile} contains variable names that are not present in .env. Only names are compared.`,
        evidence: comparison.missing.map((key) => `Missing key: ${key}`),
        recommendedAction: "Add the missing names to .env and fill the values locally.",
      }),
    );
  } else {
    findings.push(
      createFinding({
        id: "env-keys-present",
        category: "configuration",
        severity: "info",
        status: "pass",
        title: "Environment names match the example file",
        explanation: `Every name in ${env.exampleFile} is also present in .env. Values were not read into the report.`,
        evidence: [`Compared ${comparison.present.length} names from ${env.exampleFile}.`],
        recommendedAction: "No action needed from this check.",
      }),
    );
  }
  if (comparison.extra.length > 0) {
    findings.push(
      createFinding({
        id: "env-keys-extra",
        category: "configuration",
        severity: "info",
        status: "unknown",
        title: ".env has names that are not in the example",
        explanation: "These names exist locally and are absent from the example file. This may be intentional.",
        evidence: comparison.extra.map((key) => `Extra key: ${key}`),
        recommendedAction: "Add names teammates need to the example file, with empty values.",
      }),
    );
  }
  return findings;
}

function gitFindings(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  const git = snapshot.git;
  if (!git.gitAvailable) {
    return [
      createFinding({
        id: "git-missing",
        category: "git",
        severity: "warning",
        status: "fail",
        title: "Git is not available",
        explanation: "The git command was not found, so branch and working tree checks did not run.",
        evidence: [git.error ?? "git was not found on PATH."],
        recommendedAction: "Install Git and scan again.",
        fix: openDocs("open-git-docs", "Open Git downloads", DOCS.gitDownload, "Opens the Git download page."),
      }),
    ];
  }
  if (!git.isRepo) {
    const unexpected = git.error && !/not a git repository/i.test(git.error);
    if (unexpected) {
      return [
        createFinding({
          id: "git-error",
          category: "git",
          severity: "warning",
          status: "unknown",
          title: "Git status could not be read",
          explanation: "Git is installed, but this folder could not be inspected.",
          evidence: [git.error ?? "git failed."],
          recommendedAction: "Run git status in this folder and scan again.",
        }),
      ];
    }
    return [
      createFinding({
        id: "git-not-repo",
        category: "git",
        severity: "info",
        status: "unknown",
        title: "Folder is not a Git repository",
        explanation: "Dev Doctor did not find a Git work tree here. That is fine for a project that is not versioned yet.",
        evidence: ["git rev-parse did not find a repository."],
        recommendedAction: "Initialize a repository if you want branch and change tracking.",
      }),
    ];
  }

  const parsed = parseGitPorcelain(git.porcelain ?? "");
  const branch = git.branch ?? "unknown";
  if (git.error) {
    return [
      createFinding({
        id: "git-status-error",
        category: "git",
        severity: "warning",
        status: "unknown",
        title: "Git working tree could not be fully read",
        explanation: "The folder is a repository, but status information is incomplete.",
        evidence: [`Branch: ${branch}`, git.error],
        recommendedAction: "Run git status in this folder. Dev Doctor will not reset or discard changes.",
      }),
    ];
  }
  if (!parsed.dirty) {
    return [
      createFinding({
        id: "git-clean",
        category: "git",
        severity: "info",
        status: "pass",
        title: "Git working tree is clean",
        explanation: "There are no uncommitted changes in this work tree.",
        evidence: [`Branch: ${branch}`],
        recommendedAction: "No action needed.",
      }),
    ];
  }
  const shown = parsed.entries.slice(0, 15);
  return [
    createFinding({
      id: "git-dirty",
      category: "git",
      severity: "warning",
      status: "fail",
      title: "Git working tree has uncommitted changes",
      explanation: "Files in this repository differ from the last commit. Dev Doctor will not discard, reset, or overwrite them.",
      evidence: [
        `Branch: ${branch}`,
        `Changed entries: ${parsed.entries.length}`,
        ...shown.map((entry) => `${entry.code || "??"} ${entry.path}`.trim()),
        git.porcelainTruncated ? "The status list was truncated." : "",
        parsed.entries.length > shown.length ? `${parsed.entries.length - shown.length} more entries were omitted.` : "",
      ],
      recommendedAction: "Review the changes with git status and commit or stash them yourself.",
      fix: copyCommand(
        "copy-git-status",
        "Copy git status",
        "git status",
        "Copies a read-only Git command. It does not change the repository.",
      ),
    }),
  ];
}

const ECOSYSTEM_LABELS: Record<string, string> = {
  node: "Node.js",
  rust: "Rust",
  python: "Python",
  go: "Go",
  ruby: "Ruby",
  php: "PHP",
  jvm: "JVM",
  swift: "Swift",
  mixed: "Mixed",
};

export function ecosystemLabel(id: string | null): string {
  if (!id) return "Unknown";
  return ECOSYSTEM_LABELS[id] ?? id;
}

function nodeChecksApply(snapshot: ProjectSnapshot): boolean {
  if (snapshot.packageJson.present || snapshot.lockfiles.length > 0) return true;
  return snapshot.ecosystem === "node";
}

function notSourceFinding(snapshot: ProjectSnapshot): DiagnosticFinding {
  return createFinding({
    id: "not-a-source-project",
    category: "runtime",
    severity: "info",
    status: "unknown",
    title: "This folder is not a source project",
    explanation:
      "Dev Doctor did not find a project manifest here, so it skipped Node.js and npm checks. A folder that only contains other projects cannot be scanned as one project.",
    evidence: [`Folder: ${snapshot.folderName}`, "No package.json, Cargo.toml, go.mod, or similar manifest at this folder."],
    recommendedAction: "Open the folder that contains the project's manifest.",
  });
}

function otherEcosystemFinding(snapshot: ProjectSnapshot): DiagnosticFinding {
  const label = ecosystemLabel(snapshot.ecosystem);
  return createFinding({
    id: "ecosystem-not-node",
    category: "runtime",
    severity: "info",
    status: "pass",
    title: `${label} project`,
    explanation: `This folder is a ${label} project. Node.js, npm, and package.json checks were skipped.`,
    evidence: [`Detected: ${label}`, `Folder: ${snapshot.folderName}`],
    recommendedAction: "Open a Node.js project when you want dependency and engines checks.",
  });
}

export function runDiagnostics(snapshot: ProjectSnapshot): DiagnosticFinding[] {
  if (!nodeChecksApply(snapshot) && !snapshot.ecosystem) {
    return collectRuleFindings([
      () => [notSourceFinding(snapshot)],
      () => (snapshot.git.isRepo ? gitFindings(snapshot) : []),
    ]);
  }
  if (!nodeChecksApply(snapshot)) {
    return collectRuleFindings([() => [otherEcosystemFinding(snapshot)], () => gitFindings(snapshot)]);
  }
  return collectRuleFindings([
    () => nodeFindings(snapshot),
    () => toolFindings(snapshot),
    () => enginesFindings(snapshot),
    () => packageJsonFindings(snapshot),
    () => lockfileFindings(snapshot),
    () => dependencyFindings(snapshot),
    () => configurationFindings(snapshot),
    () => gitFindings(snapshot),
  ]);
}

export function projectTypeFor(snapshot: ProjectSnapshot): string {
  if (nodeChecksApply(snapshot)) {
    const pkg = snapshot.packageJson;
    if (!pkg.present) return "Node.js";
    if (pkg.readError || pkg.parseError) return "Node.js (unreadable package.json)";
    return "Node.js";
  }
  if (!snapshot.ecosystem) return "Not a source project";
  return ecosystemLabel(snapshot.ecosystem);
}

export function projectMeta(snapshot: ProjectSnapshot, findings: DiagnosticFinding[]): ProjectMeta {
  const detection = detectLockfiles(snapshot.lockfiles);
  const names = declaredDependencies(snapshot.packageJson);
  let dependenciesInstalled: ProjectMeta["dependenciesInstalled"] = "unknown";
  if (snapshot.packageJson.present && !snapshot.packageJson.parseError && !snapshot.packageJson.readError) {
    if (!snapshot.nodeModulesExists && names.length > 0) dependenciesInstalled = "no";
    else if (snapshot.nodeModulesExists && snapshot.missingDependencyNames.length > 0) dependenciesInstalled = "partial";
    else if (snapshot.nodeModulesExists || names.length === 0) dependenciesInstalled = "yes";
  }
  const managerVersion =
    detection.primary === "pnpm"
      ? snapshot.pnpm.version
      : detection.primary === "npm"
        ? snapshot.npm.version
        : null;
  const dirty = findings.some((finding) => finding.id === "git-dirty")
    ? true
    : findings.some((finding) => finding.id === "git-clean")
      ? false
      : null;
  return {
    packageManager: packageManagerLabel(detection),
    packageManagerVersion: managerVersion,
    nodeVersion: snapshot.node.version,
    enginesNode: snapshot.packageJson.enginesNode,
    gitBranch: snapshot.git.branch,
    gitDirty: snapshot.git.isRepo ? dirty : null,
    gitRepo: snapshot.git.isRepo,
    dependenciesInstalled,
    nodeModulesExists: snapshot.nodeModulesExists,
    isSample: snapshot.isSample,
  };
}

export function buildScanResult(snapshot: ProjectSnapshot, scannedAt = new Date().toISOString()): ScanResult {
  const findings = runDiagnostics(snapshot);
  const summary = summarizeFindings(findings);
  const name = snapshot.packageJson.name?.trim() || snapshot.folderName;
  return {
    id: `scan-${scannedAt}-${Math.random().toString(36).slice(2, 8)}`,
    project: {
      name,
      path: snapshot.canonicalPath,
      projectType: projectTypeFor(snapshot),
    },
    scannedAt,
    findings,
    summary,
    health: healthFromSummary(summary),
    meta: projectMeta(snapshot, findings),
  };
}

export function emptySnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  const base: ProjectSnapshot = {
    canonicalPath: "/Users/example/app",
    folderName: "app",
    packageJson: {
      present: true,
      parseError: null,
      readError: null,
      name: "app",
      enginesNode: null,
      enginesNodeError: null,
      dependencyNames: [],
      devDependencyNames: [],
    },
    lockfiles: [],
    nodeModulesExists: false,
    missingDependencyNames: [],
    dependencyCheckNote: null,
    env: {
      exampleFile: null,
      exampleKeys: [],
      exampleReadError: null,
      exampleUnparsedLines: 0,
      envFileExists: false,
      envKeys: [],
      envReadError: null,
      envUnparsedLines: 0,
      note: null,
    },
    git: {
      gitAvailable: true,
      isRepo: false,
      branch: null,
      porcelain: null,
      porcelainTruncated: false,
      error: null,
    },
    node: { available: true, version: "v20.11.0", error: null },
    npm: { available: true, version: "10.2.4", error: null },
    pnpm: { available: false, version: null, error: "pnpm was not found on PATH." },
    isSample: false,
    ecosystem: "node",
  };
  return {
    ...base,
    ...overrides,
    packageJson: { ...base.packageJson, ...overrides.packageJson },
    env: { ...base.env, ...overrides.env },
    git: { ...base.git, ...overrides.git },
    node: { ...base.node, ...overrides.node },
    npm: { ...base.npm, ...overrides.npm },
    pnpm: { ...base.pnpm, ...overrides.pnpm },
  };
}

export function statusLabel(status: DiagnosticStatus, severity: DiagnosticFinding["severity"]): string {
  if (status === "pass") return "Passed";
  if (severity === "error") return "Error";
  if (severity === "warning") return "Warning";
  return "Info";
}
