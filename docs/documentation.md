# Dev Doctor documentation

Dev Doctor is a local macOS app for a developer project folder. It measures reclaimable disk, explains what it can check in the toolchain, and shows which dev process holds a port. Project contents stay on the machine.

## Install

Download **Dev Doctor_0.4.0_aarch64.dmg** (or later) from the [latest release](https://github.com/hulk-pham/Dev-Doctor/releases/latest). Open the disk image and drag Dev Doctor to Applications. The build has no Apple Developer ID. [CONTRIBUTING.md](../CONTRIBUTING.md) explains how to read the source and build it yourself.

The published build is not notarized. The first launch: right-click the app and choose **Open**. If macOS still calls the app damaged, follow [install troubleshooting](install.md).

Apple silicon only for that disk image. To build for yourself, see [development](development.md). What shipped in each version: [changelog](../CHANGELOG.md).

## First scan

1. Open Dev Doctor and choose a project folder.
2. Click **Scan Project**.
3. On **Overview**, use the next step: **Review cleanup** or **Review errors**.

You can also drop a folder on the window. Recent folders are in the project menu and under **Projects**.

If the folder contains several projects, Dev Doctor lists them and does not scan the parent. A folder with one project inside is opened at that project. A folder with no manifest does not get Node.js or npm checks.

## Screens

### Overview

Two cards after a scan:

- **Cleanup** — bytes you can reclaim from generated or reproducible folders.
- **Diagnostics** — error, warning, and pass counts.

The banner above the cards is the suggested next step.

### Cleanup

Folders are grouped (for example dependencies and build output). Each row shows a size and why it is listed. Select rows and remove them only after the confirm dialog. Uncertain paths, source trees, and `.git` are not deletable.

### Diagnostics

Findings are grouped by category: runtime, dependencies, project configuration, Git, and ports.

- Filter by **All**, **Errors**, **Warnings**, or **Passed**.
- **Category** narrows the list.
- A row shows a short title, a colored edge, and a badge. Expand it for evidence and the recommended action.
- **Find in Processes** takes a port number and opens Processes with that listener highlighted.

Environment checks compare **names** in `.env.example` or `.env.sample` with names in `.env`. Values are discarded and are not shown.

### Processes

A list of development processes on this Mac. Listen ports are on the row.

- **Dev** / **All** changes how wide the sample is.
- **This project** is a switch. On keeps rows tied to the selected folder. Off shows the wider list.
- The search field matches a process name or a port number.
- The clock sits to the left of Pause and Refresh. Pause stops the automatic refresh so a row does not disappear while you read it.
- Stop asks you to confirm. The app refuses PID 0, PID 1, and executables under system directories.

**Find in Processes** on Diagnostics fills that same search field.

### Projects

Past scans, one row per project, so you can reopen a folder with the last result.

### Settings

Theme, scan-when-you-select-a-folder, and the path of the local data folder. The app version is on this page. **Check for updates** looks up the latest GitHub release and can remind you later or skip that version. The same command is in the Dev Doctor menu. **Settings…** in that menu opens this page. The **Tools** menu jumps to Workspace, Projects, or Processes, and can scan or refresh the process list.

## What a confirmed fix can run

| Action | Effect |
| --- | --- |
| Copy | Copies text. Nothing runs. |
| Open docs | Opens an allowlisted documentation URL. |
| Install | `npm install --ignore-scripts` or `pnpm install --ignore-scripts` in the project folder, only after Confirm. |

Installs are refused outside your user or temporary directories.

## Privacy

- No account, no telemetry, no upload of the project.
- `.env` values are not returned, displayed, or stored in scan history.
- History is JSON in the app data directory shown on Settings.

## Build and contribute

Tests, architecture, and signing: [development.md](development.md).
