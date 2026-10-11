import { describe, expect, it } from "vitest";
import { blankProjectChatPrompts } from "./chat-quick-prompts";

describe("blankProjectChatPrompts", () => {
  it("suggests scan prompts when a scan exists", () => {
    expect(blankProjectChatPrompts(true)[0]).toMatch(/scan/i);
  });

  it("suggests onboarding when no scan", () => {
    expect(blankProjectChatPrompts(false)[0]).toMatch(/Dev Doctor/i);
  });
});
