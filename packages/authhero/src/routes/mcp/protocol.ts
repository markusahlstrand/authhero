import { McpToolError, type ToolApi } from "./dispatch";
import type { McpToolDef } from "./tools";

/**
 * Minimal Model Context Protocol server over Streamable HTTP in stateless JSON
 * mode. Each POST carries one (or, for older clients, a batch of) JSON-RPC
 * message(s); requests are answered and notifications get a 202. A tools-only
 * server needs just `initialize`, `ping`, `tools/list` and `tools/call`, so
 * this is hand-rolled rather than pulling in the MCP SDK.
 */

// Newest first; the client's requested version is echoed when supported.
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

const SERVER_INFO = { name: "authhero-management", version: "1.0.0" };

type JsonRpcId = string | number;

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId | null;
      error: { code: number; message: string };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});

export const rpcError = (
  id: JsonRpcId | null,
  code: number,
  message: string,
): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" &&
    SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0]!;
}

export interface McpSession {
  api: ToolApi;
  tools: McpToolDef[];
  instructions: string;
}

/** Handle one JSON-RPC message. Returns null for notifications. */
async function handleMessage(
  session: McpSession,
  message: unknown,
): Promise<JsonRpcResponse | null> {
  if (!isRecord(message)) {
    return rpcError(null, -32600, "Invalid Request");
  }

  const rawId = message.id;
  const id =
    typeof rawId === "string" || typeof rawId === "number" ? rawId : undefined;

  if (typeof message.method !== "string") {
    // A JSON-RPC response from the client (we never send requests, but the
    // transport allows it) needs no answer.
    if ("result" in message || "error" in message) return null;
    return rpcError(id ?? null, -32600, "Invalid Request");
  }

  // Only an omitted id marks a notification. MCP forbids null ids, so a null
  // or non-scalar id is an invalid request rather than a notification.
  if (!("id" in message)) return null;
  if (id === undefined) return rpcError(null, -32600, "Invalid Request");

  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: negotiateVersion(params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: session.instructions,
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: session.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        })),
      });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const tool = session.tools.find((t) => t.name === name);
      if (!tool) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        });
      }
      const args = isRecord(params.arguments) ? params.arguments : {};
      try {
        const data = await tool.handler(session.api, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data) }],
        });
      } catch (err) {
        // Only messages we raised on purpose are shown to the model; anything
        // else may carry internals.
        if (!(err instanceof McpToolError)) {
          console.error("MCP tool failed", err);
        }
        const text =
          err instanceof McpToolError ? err.message : "Tool execution failed";
        return rpcResult(id, {
          content: [{ type: "text", text }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${message.method}`);
  }
}

/**
 * Handle a parsed POST body. Returns undefined when the body held only
 * notifications (the caller answers 202).
 */
export async function handleMcpBody(
  session: McpSession,
  body: unknown,
): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
  const messages = Array.isArray(body) ? body : [body];

  const responses: JsonRpcResponse[] = [];
  for (const message of messages) {
    const response = await handleMessage(session, message);
    if (response) responses.push(response);
  }

  if (responses.length === 0) return undefined;
  return Array.isArray(body) ? responses : responses[0];
}
