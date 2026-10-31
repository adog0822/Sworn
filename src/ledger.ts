import { DurableObject } from "cloudflare:workers";
import { answerAuditor } from "./core/answer";
import { inferKind } from "./core/checks";
import {
  addTurn, callFor, appendLog, applyBolnaExecution, applyScenario, assertClaim, freshLedger, publicView,
  resolveClaims, sealCall, startCall, type LedgerData, type ResolveArgs, type Scenario,
} from "./core/engine";
import { render } from "./core/render";
import { REPLAY, runReplayStep } from "./core/replay";
import { loadSigningKey, type SigningKey } from "./core/seal";
import type { CallRecord, ClaimInput, ClaimKind, Dialect, Framework } from "./core/types";

export interface Env {
  LEDGER: DurableObjectNamespace<Ledger>;
  ASSETS: Fetcher;
  BOLNA_API_KEY: string;
  SIGNING_KEY_JWK: string;
  TOOL_TOKEN: string;
  WEBHOOK_TOKEN: string;
  DEMO_PASSCODE: string;
  INTERVIEWER_AGENT_ID: string;
  AUDITOR_AGENT_ID: string;
}

const KINDS: ClaimKind[] = ["mfa.enforced", "access_review.completed", "accounts.deprovisioned", "change.peer_review", "encryption.at_rest"];
const DIALECTS: Dialect[] = ["engineer", "auditor", "buyer", "board"];
const FRAMEWORK_LIST: Framework[] = ["soc2", "iso27001", "nist80053", "pcidss", "hipaa", "fedramp20x"];

const list = (s?: string) => (s ?? "").split(/[,/]| and /).map((x) => x.trim().toLowerCase()).filter((x) => x && x !== "none" && !x.startsWith("%("));
const clean = (s?: string) => (s && !s.startsWith("%(") && s.toLowerCase() !== "none" ? s.trim() : undefined);

// One Durable Object holds Quillfeather's ledger. Every mutation runs inside
// blockConcurrencyWhile so tool calls from a live call never interleave.
export class Ledger extends DurableObject<Env> {
  private data?: LedgerData;
  private key?: SigningKey;

  private async load(): Promise<LedgerData> {
    if (!this.data) {
      const stored = await this.ctx.storage.get<LedgerData>("ledger");
      this.data = stored ?? (await freshLedger(new Date()));
      if (!stored) await this.save();
    }
    return this.data;
  }

  private async save() {
    const d = this.data!;
    d.claims.splice(0, Math.max(0, d.claims.length - 150));
    d.packets.splice(30);
    await this.ctx.storage.put("ledger", d);
  }

  private mutate<T>(fn: (d: LedgerData, now: Date) => Promise<T> | T): Promise<T> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const d = await this.load();
      const out = await fn(d, new Date());
      await this.save();
      return out;
    });
  }

  private async signingKey() {
    this.key ??= await loadSigningKey(this.env.SIGNING_KEY_JWK);
    return this.key;
  }

  async view() {
    return { ...publicView(await this.load()), keyId: (await this.signingKey()).keyId };
  }

  async version() {
    return (await this.load()).version;
  }

  async renders(claimId: string) {
    const c = (await this.load()).claims.find((x) => x.id === claimId);
    if (!c) return null;
    const out: Record<string, unknown> = {};
    for (const dl of DIALECTS) {
      out[dl] = dl === "auditor" ? Object.fromEntries(FRAMEWORK_LIST.map((f) => [f, render(c, "auditor", f)])) : render(c, dl);
    }
    return out;
  }

  // Typed claims from the web console: same engine, channel "web".
  async assertText(statement: string, speakerId = "priya") {
    const kind = inferKind(statement);
    if (!kind) return { error: "I couldn't map that to a control I can check yet. Try MFA, access reviews, offboarding, code review or encryption." };
    return this.mutate(async (d, now) => {
      const { claim, spoken } = await assertClaim(d, { kind, statement, channel: "web", speakerId }, now);
      return { claim: { ...claim, input: undefined }, spoken };
    });
  }

  async ask(question: string, framework: Framework = "soc2") {
    return this.mutate(async (d, now) => {
      const a = answerAuditor(question, d.claims, framework);
      await appendLog(d, now, "auditor.question", `"${question.slice(0, 120)}" → ${a.cites.join(", ") || "no verified record"}`);
      d.version++;
      return a;
    });
  }

  async scenario(name: Scenario) {
    return this.mutate(async (d, now) => {
      const r = await applyScenario(d, name, now);
      return { reason: r.reason, changed: r.changed.map((c) => ({ id: c.claim.id, from: c.from, to: c.to })) };
    });
  }

  async reset() {
    return this.mutate(async (d, now) => {
      const fresh = await freshLedger(now);
      // Signed packets and real calls are records; a demo reset never erases them.
      fresh.packets = d.packets;
      fresh.calls = d.calls.filter((c) => c.kind !== "replay");
      fresh.version = d.version + 1;
      this.data = fresh;
      return { ok: true };
    });
  }

  async replayStart() {
    return this.mutate((d, now) => {
      const call = startCall(d, {
        id: `replay-${now.getTime().toString(36)}`, kind: "replay", status: "in-progress", personId: "priya",
        reason: `${d.system.quarter} access review (sample call, no phone)`, startedAt: now.toISOString(),
      }, now);
      return { callId: call.id, steps: REPLAY.length };
    });
  }

  async replayStep(callId: string, index: number) {
    return this.mutate(async (d, now) => {
      const r = await runReplayStep(d, callId, index, now);
      if (r.done) {
        const call = d.calls.find((c) => c.id === callId);
        if (call) {
          call.status = "completed";
          call.durationSec = Math.round((now.getTime() - Date.parse(call.startedAt)) / 1000);
          await sealCall(d, callId, await this.signingKey(), now);
        }
      }
      return r;
    });
  }

  async registerCall(c: Omit<CallRecord, "turns" | "claimIds" | "updatedAt">) {
    return this.mutate((d, now) => startCall(d, c, now).id);
  }

  async markCallbackCalled(callbackId: string) {
    return this.mutate((d) => {
      const cb = d.callbacks.find((c) => c.id === callbackId);
      if (cb) cb.status = "called";
      d.version++;
    });
  }

  // Bolna tool: the engineer just stated something about a control.
  async toolVerify(p: Record<string, string>) {
    return this.mutate(async (d, now) => {
      const kind = (KINDS.includes(p.claim_kind as ClaimKind) ? p.claim_kind : inferKind(`${p.claim_kind} ${p.engineer_words}`)) as ClaimKind | null;
      if (!kind) return { say: "I can't check that one against records yet; I'll note it for the auditor as an unverified statement.", ask_next: "Move on to the next control." };
      const call = callFor(d, clean(p.execution_id), "interview", now);
      const input: ClaimInput = {
        kind, statement: clean(p.engineer_words) ?? kind, scope: clean(p.scope), systems: list(p.systems),
        approver: clean(p.approver), period: clean(p.period), channel: "call", callId: call?.id, speakerId: call?.personId,
      };
      const { claim, spoken } = await assertClaim(d, input, now);
      if (call) addTurn(d, call.id, { role: "tool", text: `verify_claim → ${claim.id} ${claim.verdict.toUpperCase()}: ${spoken.say}` }, now);
      return { claim_id: claim.id, verdict: claim.verdict, say: spoken.say, ask_next: spoken.ask_next };
    });
  }

  async toolResolve(p: Record<string, string>) {
    return this.mutate(async (d, now) => {
      const call = callFor(d, clean(p.execution_id), "interview", now);
      const resolution = (["approved_exception", "remediation", "disputed", "corrected"].includes(p.resolution) ? p.resolution : "remediation") as ResolveArgs["resolution"];
      const resolved = await resolveClaims(d, {
        claimId: clean(p.claim_id), subject: clean(p.subject), kind: KINDS.includes(p.claim_kind as ClaimKind) ? (p.claim_kind as ClaimKind) : undefined,
        callId: call?.id, resolution, note: clean(p.note) ?? "Explained by the control owner on the call",
        owner: clean(p.owner), due: clean(p.due),
      }, now);
      if (call) addTurn(d, call.id, { role: "tool", text: `resolve_claim → ${resolved.map((c) => c.id).join(", ") || "no open claim"}: ${resolution.replace("_", " ")}` }, now);
      return resolved.length
        ? { ok: true, resolved: resolved.map((c) => c.id), say: `Logged on ${resolved.map((c) => c.id).join(", ")} as ${resolution.replace("_", " ")}${clean(p.owner) ? `, owned by ${clean(p.owner)}` : ""}${clean(p.due) ? `, due ${clean(p.due)}` : ""}.` }
        : { ok: false, say: "There was no open claim to attach that to; I've noted it on the call record." };
    });
  }

  async toolAnswer(p: Record<string, string>) {
    const fw = (FRAMEWORK_LIST.find((f) => (p.framework ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(f.replace("dss", ""))) ?? "soc2") as Framework;
    return this.mutate(async (d, now) => {
      const call = callFor(d, clean(p.execution_id), "auditor", now);
      const a = answerAuditor(p.question ?? "", d.claims, fw);
      if (call) addTurn(d, call.id, { role: "tool", text: `answer_auditor_question → ${a.cites.join(", ") || "no verified record"}` }, now);
      d.version++;
      return { answer: a.answer, cites: a.cites };
    });
  }

  async webhook(payload: Record<string, unknown>) {
    return this.mutate(async (d, now) => {
      const { call, finished } = applyBolnaExecution(d, payload, now);
      if (call && finished && call.status === "completed") await sealCall(d, call.id, await this.signingKey(), now);
      return { ok: true, callId: call?.id, status: call?.status };
    });
  }

  // Browser calls are open to anyone with the link, so cap them to protect credits.
  async allowWebCall(limitPerHour = 20) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const hourAgo = Date.now() - 3_600_000;
      const recent = ((await this.ctx.storage.get<number[]>("webcalls")) ?? []).filter((t) => t > hourAgo);
      if (recent.length >= limitPerHour) return false;
      recent.push(Date.now());
      await this.ctx.storage.put("webcalls", recent);
      return true;
    });
  }

  async packet(id: string) {
    return (await this.load()).packets.find((p) => p.body.packetId === id) ?? null;
  }

  // Router role: maps a Bolna execution id to the visitor sandbox that started it.
  async setRoute(executionId: string, sid: string) {
    await this.ctx.storage.put(`route:${executionId}`, sid);
  }

  async getRoute(executionId: string) {
    return (await this.ctx.storage.get<string>(`route:${executionId}`)) ?? null;
  }

  async publicKey() {
    const k = await this.signingKey();
    return { keys: [{ kid: k.keyId, use: "sig", alg: "EdDSA", ...k.publicJwk }] };
  }
}
