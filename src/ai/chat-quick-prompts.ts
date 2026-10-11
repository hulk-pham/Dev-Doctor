/** Short follow-ups after a diagnosis or on a blank project chat. */
export const DIAGNOSIS_FOLLOW_UP_PROMPTS = [
  "What should I try first?",
  "Which step is lowest risk?",
  "Explain this in simpler terms.",
] as const;

export function blankProjectChatPrompts(hasScan: boolean): string[] {
  if (!hasScan) {
    return ["How do I get started with Dev Doctor?"];
  }
  return ["Summarize the biggest issues from my scan.", "What should I fix first?"];
}
