# Dev Doctor — rules for agents

**Always read:** `.cursor/rules/dev-doctor.mdc` (handoff, architecture, ship loop).

**UI (one kit):** `.cursor/rules/ui-kit.mdc` + **`docs/product/ui-kit.md`** — toolbars, scope, icons, tabs. Code: `screen-toolbar.tsx`.

**State:** `docs/handoff.md` at chat start; update at end.

**Roadmap:** `docs/roadmap/06-monitor-diagnose-fix.md` — tick a task only after its check ran; add a dated line to its Log.

| When you touch… | Also read |
| --- | --- |
| Any page / component | `ui-kit.mdc` (above) |
| Layout, title row, nav width | `ui-chrome.mdc` |
| Product journeys / ux debt | `design-principles.md`, `ux-review.md` |
| Diagnostic rules / Rust | `diagnostics.mdc` |
| AI BYOK / Keychain / Send to AI | `ai-byok.mdc` |
| Desktop window verify | `debug-harness.mdc` |

**Chrome regression:** menu toggle `left = zoom.x + zoom.width + 14`; same `y`/`height` as green button.
