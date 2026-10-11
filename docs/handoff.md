# Handoff

Updated 2026-10-11. Shipped **0.5.0** — AI chat BYOK, side panel, providers (committed).

## Shipped locally

- **Explain deep link:** `openExplainSourceView` + header **View in …** (`explain-source-nav.ts`); Diagnostics finding ring + scroll; Processes PID select via `processesHighlightPid`.
- **Assistant markdown:** `ChatMarkdown` on non-diagnosis assistant bubbles.
- **After fix:** toast + ring next executable step on latest diagnosis card; `showToast` on app context.
- **Side panel:** drag left edge to widen chat/inspector (persist `dev-doctor.inspector-width`); tighter padding above Chat/Project tabs.
- **Projects:** intro line (like Processes); selector one line on non-workspace views.
- Prior: `useAiChatState` / cancel HTTP / diagnosis cards / quick prompts / mock AI / P4b.7.

## Checks

`npm test` (91), `npm run typecheck` — pass this session. `cargo test --lib` unchanged.

## Next

- MCP UI verify chat panel (View in …, markdown, step highlight after mock fix).
- Optional: Processes row scroll-into-view on PID highlight; Rust export cleanup.
