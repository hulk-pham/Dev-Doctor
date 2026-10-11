import type { ArtifactFinding } from "../diagnostics/artifacts";
import { canDeleteArtifact } from "../diagnostics/artifacts";
import { isAllowedDocUrl } from "../diagnostics/allowed-urls";
import type { DiagnosticFinding, FixSuggestion } from "../domain/types";
import type { AiDiagnosisResponse, AiRecommendedStep, AiStepRisk } from "./types";

export type DiagnosisActionKind =
  | "text"
  | "copyCommand"
  | "openUrl"
  | "runFix"
  | "deleteArtifact"
  | "stopProcess";

export interface DiagnosisAnchors {
  projectPath: string | null;
  finding?: DiagnosticFinding;
  artifacts?: ArtifactFinding[];
  artifact?: ArtifactFinding;
  process?: { pid: number; name: string; command?: string; ports?: number[] };
}

export interface PlannedStep {
  index: number;
  step: string;
  risk: AiStepRisk;
  action: DiagnosisActionKind;
  payload?: {
    command?: string;
    url?: string;
    fix?: FixSuggestion;
    relativePath?: string;
    pid?: number;
    processName?: string;
  };
  executable: boolean;
  refusedReason?: string;
}

const DESTRUCTIVE_RISKS: AiStepRisk[] = ["confirm", "danger"];

export function planDiagnosisSteps(response: AiDiagnosisResponse, anchors: DiagnosisAnchors): PlannedStep[] {
  return response.recommendedSteps.map((entry, index) => planOneStep(index, entry, anchors));
}

function planOneStep(index: number, entry: AiRecommendedStep, anchors: DiagnosisAnchors): PlannedStep {
  const base = { index, step: entry.step, risk: entry.risk };

  const fix = anchors.finding?.fix;
  if (fix?.kind === "execute" && DESTRUCTIVE_RISKS.includes(entry.risk) && stepMentionsFix(entry.step, fix)) {
    return {
      ...base,
      action: "runFix",
      payload: { fix },
      executable: true,
    };
  }

  if (fix?.kind === "open-url" && fix.url && isAllowedDocUrl(fix.url) && stepMentionsDocs(entry.step)) {
    return {
      ...base,
      action: "openUrl",
      payload: { url: fix.url },
      executable: entry.risk === "read",
    };
  }

  if (fix?.kind === "copy" && fix.commandText && stepMentionsCopy(entry.step)) {
    return {
      ...base,
      action: "copyCommand",
      payload: { command: fix.commandText },
      executable: entry.risk === "read",
    };
  }

  const artifact = matchArtifactPath(entry.step, anchors);
  if (artifact && stepMentionsDelete(entry.step)) {
    if (!DESTRUCTIVE_RISKS.includes(entry.risk)) {
      return textOnly(base, "Deleting needs a confirm or danger risk on this step.");
    }
    if (!canDeleteArtifact(artifact)) {
      return textOnly(base, "This path is not in the artifact catalog as safe to delete.");
    }
    if (!anchors.projectPath) {
      return textOnly(base, "Select a project folder before deleting artifacts.");
    }
    return {
      ...base,
      action: "deleteArtifact",
      payload: { relativePath: artifact.relativePath },
      executable: true,
    };
  }

  if (anchors.process && stepMentionsStop(entry.step) && stepMentionsPid(entry.step, anchors.process.pid)) {
    if (!DESTRUCTIVE_RISKS.includes(entry.risk)) {
      return textOnly(base, "Stopping a process needs a confirm or danger risk on this step.");
    }
    return {
      ...base,
      action: "stopProcess",
      payload: { pid: anchors.process.pid, processName: anchors.process.name },
      executable: true,
    };
  }

  if (entry.risk === "danger") {
    return textOnly(base, "Dev Doctor will not run dangerous steps automatically.");
  }

  return textOnly(base);
}

function textOnly(
  base: { index: number; step: string; risk: AiStepRisk },
  refusedReason?: string,
): PlannedStep {
  return {
    ...base,
    action: "text",
    executable: false,
    refusedReason,
  };
}

function stepMentionsFix(step: string, fix: FixSuggestion): boolean {
  const lower = step.toLowerCase();
  return lower.includes("install") || lower.includes(fix.label.toLowerCase()) || lower.includes("fix");
}

function stepMentionsDocs(step: string): boolean {
  const lower = step.toLowerCase();
  return lower.includes("doc") || lower.includes("read") || lower.includes("guide") || lower.includes("open");
}

function stepMentionsCopy(step: string): boolean {
  const lower = step.toLowerCase();
  return lower.includes("copy") || lower.includes("command") || lower.includes("run ");
}

function stepMentionsDelete(step: string): boolean {
  const lower = step.toLowerCase();
  return lower.includes("delete") || lower.includes("remove") || lower.includes("clean");
}

function stepMentionsStop(step: string): boolean {
  const lower = step.toLowerCase();
  return lower.includes("stop") || lower.includes("terminate") || lower.includes("kill");
}

function stepMentionsPid(step: string, pid: number): boolean {
  return step.includes(String(pid)) || !/\bpid\b/i.test(step);
}

function matchArtifactPath(step: string, anchors: DiagnosisAnchors): ArtifactFinding | null {
  const candidates = [
    ...(anchors.artifact ? [anchors.artifact] : []),
    ...(anchors.artifacts ?? []),
  ];
  for (const item of candidates) {
    if (step.includes(item.relativePath)) {
      return item;
    }
  }
  return null;
}
