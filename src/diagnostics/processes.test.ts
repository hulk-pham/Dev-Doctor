import { describe, expect, it } from "vitest";
import { filterProcessesForView, formatTcpPorts, processHasPort, processMatchesQuery, projectForProcess } from "./processes";

const projects = [
  { path: "/Users/hung/web", name: "web" },
  { path: "/Users/hung/web/apps/site", name: "site" },
];

describe("projectForProcess", () => {
  it("matches the longest project path in the working directory", () => {
    const match = projectForProcess(
      { name: "node", command: "next-server", cwd: "/Users/hung/web/apps/site" },
      projects,
    );
    expect(match?.name).toBe("site");
  });

  it("matches a next process from its command path", () => {
    const match = projectForProcess(
      { name: "next-server", command: "next-server /Users/hung/web", cwd: null },
      projects,
    );
    expect(match?.name).toBe("web");
  });

  it("does not claim a project for an unrelated process", () => {
    expect(projectForProcess({ name: "WindowServer", command: "WindowServer", cwd: null }, projects)).toBeNull();
  });
});

describe("filterProcessesForView", () => {
  it("keeps only development tools unless show all is on", () => {
    const rows = [
      { development: true, name: "node" },
      { development: false, name: "WindowServer" },
    ];
    expect(filterProcessesForView(rows, false).map((row) => row.name)).toEqual(["node"]);
    expect(filterProcessesForView(rows, true)).toHaveLength(2);
  });
});

describe("formatTcpPorts", () => {
  it("formats listen ports for a row", () => {
    expect(formatTcpPorts([3000, 5173])).toBe(":3000, :5173");
    expect(formatTcpPorts([])).toBe("");
  });

  it("detects a port on a process", () => {
    expect(processHasPort({ tcpPorts: [3000] }, 3000)).toBe(true);
    expect(processHasPort({ tcpPorts: [3000] }, 4000)).toBe(false);
  });
});

describe("processMatchesQuery", () => {
  const row = { name: "node", command: "next-server", tcpPorts: [3000, 5173] };

  it("matches a process name or a listen port", () => {
    expect(processMatchesQuery(row, "")).toBe(true);
    expect(processMatchesQuery(row, "node")).toBe(true);
    expect(processMatchesQuery(row, "3000")).toBe(true);
    expect(processMatchesQuery(row, ":5173")).toBe(true);
    expect(processMatchesQuery(row, "postgres")).toBe(false);
  });
});