import { HttpError, json, readJson } from "../http";
import { TOOLS, ToolError, type Api } from "./tools";

/**
 * The MCP server at `/mcp`, as Storybild has it: Streamable HTTP, stateless, answering each JSON-RPC message with
 * plain JSON (no event stream, no session). Each tool calls this Worker's own API as the signed-in client, so a tool
 * can do exactly what that person, and their token, may do through the API.
 */

const PROTOCOL_VERSIONS = ["2025-03-26", "2025-06-18", "2025-11-25"];
const LATEST = PROTOCOL_VERSIONS.at(-1)!;
/** A config or document can be up to 1 MB; a little more for the JSON-RPC around it. */
const MAX_BODY = 1024 * 1024 + 64 * 1024;

export const INSTRUCTIONS = [
  "Skope holds architecture diagrams: nodes (services, databases, queues, people, AI agents…), connections between them, containers that group them, tags that colour-code them and views that show a slice of them. Diagrams live in workspaces.",
  "Start with list_workspaces, then list_diagrams, then get_diagram (outline by default) for the one you need. list_types shows the node types a workspace offers.",
  "Name nodes and containers by id or exact name. For a bigger change, write a Skope config and use apply_config with mode merge: nodes and containers by id, tags by key, views by name, new connections added.",
  "Only a diagram's owner can change it. Changes save straight away; anyone with the diagram open is told it changed and can load the latest.",
  "Before changing a lot, take_snapshot so the person can look back, and say what you plan to change. There is no delete for whole diagrams.",
].join(" ");

interface Message {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const reply = (id: Message["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const failure = (id: Message["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function callTool(id: Message["id"], params: Record<string, unknown>, api: Api): Promise<object> {
  const tool = TOOLS.find(t => t.name === params.name);
  if (!tool) return failure(id, -32602, `no tool named ${JSON.stringify(params.name)}`);
  const args = params.arguments && typeof params.arguments === "object" ? (params.arguments as Record<string, unknown>) : {};
  try {
    const out = await tool.run(args, api);
    return reply(id, { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out });
  } catch (e) {
    // A refusal the model can act on (not allowed, not found, a config it got wrong) is a tool result, not a
    // protocol error, so the model sees why.
    if (e instanceof ToolError || e instanceof HttpError) return reply(id, { content: [{ type: "text", text: e.message }], isError: true });
    throw e;
  }
}

async function handle(message: Message, api: Api): Promise<object | null> {
  if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return failure(message?.id, -32600, "not a JSON-RPC 2.0 request");
  }
  const { id, method } = message;
  const params = message.params ?? {};
  if (id === undefined) return null; // a notification (initialized, cancelled…): nothing to answer

  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return reply(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "skope", title: "Skope", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, {
        tools: TOOLS.map(t => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly, destructiveHint: t.destructive ?? false, openWorldHint: false },
        })),
      });
    case "tools/call":
      return callTool(id, params, api);
    default:
      return failure(id, -32601, `method ${method} is not supported`);
  }
}

export async function mcpRoute(request: Request, api: Api): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "this MCP server answers POST only (no event stream)" }), { status: 405, headers: { allow: "POST", "content-type": "application/json" } });
  }
  let body: unknown;
  try {
    body = await readJson(request, MAX_BODY);
  } catch (e) {
    if (e instanceof HttpError && e.status !== 400) return json({ error: e.message }, e.status);
    return json(failure(null, -32700, "the body is not JSON"), 400);
  }
  if (Array.isArray(body)) {
    const answers = (await Promise.all(body.map(m => handle(m as Message, api)))).filter(a => a !== null);
    return answers.length ? json(answers) : new Response(null, { status: 202 });
  }
  const answer = await handle(body as Message, api);
  return answer ? json(answer) : new Response(null, { status: 202 });
}
