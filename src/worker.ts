import { BolnaError, mintWebCallSession, placeCall } from "./bolna";
import type { Scenario } from "./core/engine";
import { verifySealed, type Sealed } from "./core/seal";
import type { Framework } from "./core/types";
import { Ledger, type Env } from "./ledger";
import { handleMcp } from "./mcp";

export { Ledger };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const ledger = (env: Env) => env.LEDGER.get(env.LEDGER.idFromName("quillfeather-v2"));

const SCENARIOS: Scenario[] = ["contractor_removed", "new_admin_without_mfa", "admin_bypass_closed"];

async function body(req: Request): Promise<Record<string, any>> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function callContext(state: Awaited<ReturnType<Ledger["view"]>>, personId: string, reason?: string) {
  const person = state.people.find((p) => p.id === personId) ?? state.people[0];
  return {
    owner_name: person.name.split(" ")[0],
    owner_full_name: person.name,
    owner_role: person.role,
    company: state.company,
    quarter: state.quarter,
    call_reason: reason ?? `the ${state.quarter} user access review`,
  };
}

async function startPhoneCall(req: Request, env: Env) {
  const b = await body(req);
  if (!env.DEMO_PASSCODE || b.passcode !== env.DEMO_PASSCODE) return json({ error: "Phone calls need the demo passcode. Use the browser call or the sample call instead." }, 403);
  const phone = String(b.phone ?? "").replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json({ error: "Use E.164 format, like +16175551234." }, 422);
  const kind = b.kind === "auditor" ? "auditor" : "interview";
  const agentId = kind === "auditor" ? env.AUDITOR_AGENT_ID : env.INTERVIEWER_AGENT_ID;
  if (!agentId) return json({ error: "Bolna agents are not configured on this deployment." }, 503);
  const stub = ledger(env);
  const state = await stub.view();
  const personId = kind === "auditor" ? "auditor" : String(b.personId ?? "priya");
  const callback = b.callbackId ? state.callbacks.find((c) => c.id === b.callbackId) : undefined;
  const ctx = callContext(state, personId, callback?.reason);
  try {
    const r = await placeCall(env.BOLNA_API_KEY, agentId, phone, ctx);
    await stub.registerCall({
      id: r.execution_id, kind, status: r.status ?? "queued", personId, to: phone,
      reason: callback ? `Drift callback for ${callback.claimId}` : kind === "auditor" ? "Auditor line" : ctx.call_reason,
      startedAt: new Date().toISOString(),
    });
    if (callback) await stub.markCallbackCalled(callback.id);
    return json({ executionId: r.execution_id, status: r.status });
  } catch (e) {
    const status = e instanceof BolnaError ? e.status : 500;
    return json({ error: e instanceof BolnaError ? `Bolna said: ${e.body.slice(0, 240)}` : String(e) }, status >= 400 && status < 600 ? status : 502);
  }
}

// The browser SDK posts {user_data} here; kind and callback come in the query string.
async function startWebCall(req: Request, env: Env, url: URL) {
  const b = await body(req);
  const kind = url.searchParams.get("kind") === "auditor" ? "auditor" : "interview";
  const agentId = kind === "auditor" ? env.AUDITOR_AGENT_ID : env.INTERVIEWER_AGENT_ID;
  if (!agentId) return json({ error: "Bolna agents are not configured on this deployment." }, 503);
  const stub = ledger(env);
  if (!(await stub.allowWebCall())) return json({ error: "The browser line is busy (hourly limit). Try the sample call." }, 429);
  const state = await stub.view();
  const personId = kind === "auditor" ? "auditor" : "priya";
  const callback = state.callbacks.find((c) => c.id === url.searchParams.get("callback"));
  const ctx = callContext(state, personId, callback ? `a claim that stopped matching your systems. ${callback.reason}` : undefined);
  const res = await mintWebCallSession(env.BOLNA_API_KEY, agentId, { ...ctx, ...(b.user_data ?? {}) });
  const text = await res.text();
  if (res.ok) {
    const runId = (JSON.parse(text) as { run_id?: string }).run_id;
    if (runId) {
      await stub.registerCall({
        id: runId, kind, status: "connecting", personId, startedAt: new Date().toISOString(),
        reason: callback ? `Drift callback for ${callback.claimId} (browser)` : kind === "auditor" ? "Auditor line (browser)" : `${ctx.call_reason} (browser)`,
      });
      if (callback) await stub.markCallbackCalled(callback.id);
    }
  }
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const stub = ledger(env);
  const path = url.pathname;
  const method = req.method;

  if (path === "/api/state" && method === "GET") return json(await stub.view());
  if (path === "/api/version" && method === "GET") return json({ version: await stub.version() });

  const renders = path.match(/^\/api\/claims\/(SW-\d+)\/renders$/);
  if (renders && method === "GET") {
    const r = await stub.renders(renders[1]);
    return r ? json(r) : json({ error: "No such claim" }, 404);
  }
  if (path === "/api/claims" && method === "POST") {
    const b = await body(req);
    const statement = String(b.statement ?? "").slice(0, 400);
    if (!statement.trim()) return json({ error: "Say something about a control." }, 422);
    const r = await stub.assertText(statement, b.speakerId);
    return json(r, "error" in r ? 422 : 200);
  }
  if (path === "/api/ask" && method === "POST") {
    const b = await body(req);
    return json(await stub.ask(String(b.question ?? "").slice(0, 400), (b.framework ?? "soc2") as Framework));
  }
  if (path === "/api/scenario" && method === "POST") {
    const b = await body(req);
    if (!SCENARIOS.includes(b.name)) return json({ error: "Unknown scenario" }, 422);
    return json(await stub.scenario(b.name));
  }
  if (path === "/api/reset" && method === "POST") return json(await stub.reset());
  if (path === "/api/replay" && method === "POST") {
    const b = await body(req);
    if (b.action === "start") return json(await stub.replayStart());
    return json(await stub.replayStep(String(b.callId), Number(b.index)));
  }
  if (path === "/api/calls" && method === "POST") return startPhoneCall(req, env);
  if (path === "/api/web-call/session" && method === "POST") return startWebCall(req, env, url);

  const packet = path.match(/^\/api\/packets\/(PKT-\d+)$/);
  if (packet && method === "GET") {
    const p = await stub.packet(packet[1]);
    return p ? json(p) : json({ error: "No such packet" }, 404);
  }
  if (path === "/api/verify" && method === "POST") {
    const b = (await body(req)) as Sealed<unknown>;
    const { keys } = await stub.publicKey();
    const key = keys.find((k) => k.kid === b.keyId);
    if (!key) return json({ ok: false, reason: "unknown signing key" });
    return json(await verifySealed(b, { kty: key.kty, crv: key.crv, x: key.x }));
  }

  // Bolna calls these mid-call. Auth is the bearer secret set on each tool.
  const tool = path.match(/^\/api\/bolna\/tools\/([a-z_]+)$/);
  if (tool && method === "POST") {
    if (req.headers.get("Authorization") !== `Bearer ${env.TOOL_TOKEN}`) return json({ error: "unauthorized" }, 401);
    const p = await body(req);
    if (tool[1] === "verify_claim") return json(await stub.toolVerify(p));
    if (tool[1] === "resolve_claim") return json(await stub.toolResolve(p));
    if (tool[1] === "answer_auditor_question") return json(await stub.toolAnswer(p));
    return json({ error: "unknown tool" }, 404);
  }
  if (path === "/api/bolna/webhook" && method === "POST") {
    if (url.searchParams.get("token") !== env.WEBHOOK_TOKEN) return json({ error: "unauthorized" }, 401);
    return json(await stub.webhook(await body(req)));
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, env, url);
      if (url.pathname === "/.well-known/sworn-keys.json") return json(await ledger(env).publicKey());
      if (url.pathname === "/mcp") return await handleMcp(req, ledger(env));
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: "Internal error", detail: String(e).slice(0, 200) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
