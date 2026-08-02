import assert from "node:assert/strict";
import test from "node:test";
import type { ApiKey } from "@prisma/client";
import {
  MCP_TOOL_NAMES,
  MCP_TOOLS,
  buildAgentPrompt,
  isToolAvailable,
  type ApiScope,
} from "@pemie/shared";
import { invokeMcpTool, listMcpToolDefs } from "./index.js";

function key(scopes: ApiScope[], scopeLevel: "project" | "workspace" | "user" = "project"): ApiKey {
  return { scopes, scopeLevel, projectId: "project-1", expiresAt: null } as ApiKey;
}

test("el mapa compartido es total y search exige uno de sus cuatro scopes", () => {
  assert.deepEqual(Object.keys(MCP_TOOLS).sort(), [...MCP_TOOL_NAMES].sort());
  assert.equal(isToolAvailable(MCP_TOOLS.search.access, ["reports:read"]), false);
  assert.equal(isToolAvailable(MCP_TOOLS.search.access, ["stories:read"]), true);
});

test("prompt y catálogo MCP comparten exactamente el filtro de scopes", () => {
  const scopes: ApiScope[] = ["reports:read", "stories:read"];
  const prompt = buildAgentPrompt({
    workspaceSlug: "acme",
    target: { scopeLevel: "project", project: { slug: "web", id: "project-1" } },
    scopes,
    keyRef: { kind: "prefix", prefix: "pemie_sk_abc123" },
    mcpUrl: "https://example.test/mcp",
  });
  assert.deepEqual(prompt.included, listMcpToolDefs(key(scopes)).map((tool) => tool.name));
});

test("una key solo reports no recibe ni puede invocar search", async () => {
  const reportsOnly = key(["reports:read"]);
  assert.equal(listMcpToolDefs(reportsOnly).some((tool) => tool.name === "search"), false);
  await assert.rejects(() => invokeMcpTool(reportsOnly, "search", { query: "hola" }), /permisos requeridos/);
});

test("el renderer describe de forma distinta los dos alcances", () => {
  const scoped: ApiScope[] = ["commits:read"];
  const project = buildAgentPrompt({
    workspaceSlug: "acme",
    target: { scopeLevel: "project", project: { slug: "web", id: "project-1" } },
    scopes: scoped,
    keyRef: { kind: "prefix", prefix: "pemie_sk_abc123" },
    mcpUrl: "https://example.test/mcp",
  });
  const workspace = buildAgentPrompt({
    workspaceSlug: "acme",
    target: { scopeLevel: "workspace" },
    scopes: scoped,
    keyRef: { kind: "prefix", prefix: "pemie_sk_abc123" },
    mcpUrl: "https://example.test/mcp",
  });
  assert.match(project.text, /no tienen el parámetro projectId/);
  assert.match(workspace.text, /pasa projectId en CADA tool/);
});

if (false) {
  // @ts-expect-error el renderer no permite alcance proyecto sin proyecto.
  buildAgentPrompt({ workspaceSlug: "acme", target: { scopeLevel: "project" }, scopes: [], keyRef: { kind: "prefix", prefix: "x" }, mcpUrl: "https://example.test/mcp" });
}
