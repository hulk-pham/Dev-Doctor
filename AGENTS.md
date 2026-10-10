# Dev Doctor agent map

Read these rules before changing the app:

- `.cursor/rules/architecture.mdc` — Rust owns the machine, React owns findings
- `.cursor/rules/agent-workflow.mdc` — tests, MCP check, done report, when to stop
- `.cursor/rules/debug-harness.mdc` — drive the real window on port 9223
- `.cursor/rules/ui-chrome.mdc` — editor layout and the title-row measurements
- `.cursor/rules/diagnostics.mdc` — safe findings and fixes

Latest lessons:

- 2026-10-10: Menu toggle stays 14px right of the green window button, with equal padding above and below.
- 2026-10-10: Expanding the menu widens the icon column. Do not add a second panel.
- 2026-10-10: No in-app layout harness. Inspect with the MCP bridge, then write a one-line note if the lesson is new.
