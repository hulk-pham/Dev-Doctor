# Handoff

Updated 2026-10-11. Branch `main`. Release **v0.4.0** on GitHub. **P4 + P5** on working tree (uncommitted).

## Product

Local-first macOS app. Tauri 2 owns the machine. React renders findings. No telemetry.

**Processes:** list, trends, alerts. **AI (BYOK):** OpenAI key in Keychain; **Explain with AI** opens the **Diagnosis** inspector (context review → send → steps with guarded actions). Entry: alerts, Diagnostics findings, Cleanup rows, process rows. Settings → **AI & Privacy**.

Monitoring: SQLite history, retention, watchdog. Multi-provider adapters → roadmap **P4b** (not implemented).

## Where to edit

| Concern | File |
| --- | --- |
| Diagnosis panel + plan | `src/components/ai/DiagnosisPanel.tsx`, `src/ai/fix-plan.ts` |
| Session / IPC | `src/state/AppState.tsx`, `src-tauri/src/ai/*` |
| Context builders | `src/ai/context-builder.ts` |

## Local (uncommitted)

- P4 OpenAI BYOK; P5 diagnosis panel + fix planner + entry points.
- Roadmap: **P4b** Wave 1 & 2 providers; P5 tasks ticked pending MCP verify.

## Next

- MCP: Explain flow on alert + Diagnostics + Cleanup + process row; confirm refused vs executable steps.
- **P4b** when ready to ship multi-provider.
- Optional release **0.5.0** after MCP.

## Checks

Logic: `npm test` (81), `cargo test --lib`, `npm run typecheck`. UI MCP 2026-10-11: Alerts hint khi chưa key; alert mở rộng không có Explain; inspector project OK. **Chưa** mở Diagnosis panel — `ai_key_status` / Save key trong session MCP vẫn “Not set” (Keychain có thể cần duyệt tay). Verify đầy đủ: Settings → Save key → Processes → Alerts → Explain → panel phải.
