import type { Ledger } from "./ledger";
import type { Framework } from "./core/types";

// A minimal MCP server (streamable HTTP, JSON responses) so a buyer's or an
// auditor's agent can interrogate the same verified ledger the voice agent uses.

const TOOLS = [
  {
    name: "list_claims",
    description: "List Quillfeather's compliance claims with their verification verdicts (verified, partial, contradicted) and the controls they map to.",
    inputSchema: { type: "object", properties: { kind: { type: "string", description: "Optional claim kind filter, e.g. mfa.enforced" } } },
  },
  {
    name: "ask_compliance",
    description: "Ask a compliance question in any framework's terms. Answers only from claims that were corroborated against system records, with claim IDs.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        framework: { type: "string", enum: ["soc2", "iso27001", "nist80053", "pcidss", "hipaa", "fedramp20x"] },
      },
      required: ["question"],
    },
  },
  {
    name: "get_packet",
    description: "Fetch a signed evidence packet (Ed25519 over a SHA-256 of its canonical JSON). Verify with the keys at /.well-known/sworn-keys.json.",
    inputSchema: { type: "object", properties: { packet_id: { type: "string" } }, required: ["packet_id"] },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

const reply = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const text = (value: unknown) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

async function call(stub: DurableObjectStub<Ledger>, name: string, args: any) {
  if (name === "list_claims") {
    const s = await stub.view();
    return text(s.claims.filter((c) => !args?.kind || c.kind === args.kind).map((c) => ({
      id: c.id, kind: c.kind, claim: c.normalized, speaker: c.speaker.name, verdict: c.verdict, status: c.status,
      asserted_at: c.assertedAt, exceptions: c.checks.flatMap((k) => k.exceptions.map((f) => f.detail)),
      resolution: c.resolution?.note,
    })));
  }
  if (name === "ask_compliance") return text(await stub.ask(String(args?.question ?? ""), (args?.framework ?? "soc2") as Framework));
  if (name === "get_packet") return text((await stub.packet(String(args?.packet_id ?? ""))) ?? "No such packet");
  throw new Error(`Unknown tool ${name}`);
}

export async function handleMcp(req: Request, stub: DurableObjectStub<Ledger>): Promise<Response> {
  if (req.method !== "POST") return new Response("Sworn MCP endpoint: POST JSON-RPC here.", { status: 405, headers: { Allow: "POST" } });
  const msg = (await req.json()) as Rpc | Rpc[];
  const msgs = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of msgs) {
    if (m.id === undefined || m.id === null) continue; // notification
    try {
      if (m.method === "initialize") {
        out.push(reply(m.id, {
          protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "sworn", version: "0.1.0" },
          instructions: "Sworn holds Quillfeather's verified compliance claims. Every answer cites a claim ID; nothing is asserted that system records did not corroborate.",
        }));
      } else if (m.method === "tools/list") {
        out.push(reply(m.id, { tools: TOOLS }));
      } else if (m.method === "tools/call") {
        out.push(reply(m.id, await call(stub, m.params?.name, m.params?.arguments)));
      } else if (m.method === "ping") {
        out.push(reply(m.id, {}));
      } else {
        out.push({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } });
      }
    } catch (e) {
      out.push({ jsonrpc: "2.0", id: m.id, error: { code: -32000, message: String(e) } });
    }
  }
  if (!out.length) return new Response(null, { status: 202 });
  return new Response(JSON.stringify(Array.isArray(msg) ? out : out[0]), { headers: { "Content-Type": "application/json" } });
}
