import { normalize, runChecks } from "./checks";
import { plainSummary, spokenVerdict } from "./render";
import { seal, sha256, type Sealed, type SigningKey } from "./seal";
import { personById, seedState, type SystemState } from "./state";
import type {
  CallRecord, Callback, Claim, ClaimInput, ClaimKind, LogEvent, Packet, ResolutionKind, Turn, Verdict,
} from "./types";

export interface LedgerData {
  system: SystemState;
  claims: Claim[];
  calls: CallRecord[];
  packets: Sealed<Packet>[];
  packetTokens: Record<string, string>;
  callbacks: Callback[];
  log: LogEvent[];
  seq: number;
  version: number;
}

const iso = (d: Date) => d.toISOString();
const RANK: Record<Verdict, number> = { verified: 3, partial: 2, unverifiable: 1, contradicted: 0 };

export async function appendLog(d: LedgerData, now: Date, type: string, summary: string, ref?: string) {
  const prev = d.log.at(-1)?.hash ?? "genesis";
  const seq = (d.log.at(-1)?.seq ?? 0) + 1;
  const at = iso(now);
  const hash = await sha256({ seq, at, type, summary, ref, prev });
  d.log.push({ seq, at, type, summary, ref, prev, hash });
  if (d.log.length > 300) d.log.splice(0, d.log.length - 300);
}

function nextId(d: LedgerData) {
  d.seq += 1;
  return `SW-${String(d.seq).padStart(3, "0")}`;
}

export async function assertClaim(d: LedgerData, input: ClaimInput, now: Date) {
  d.system.asOf = iso(now);
  const { checks, verdict } = await runChecks(input, d.system);
  const claim: Claim = {
    id: nextId(d),
    kind: input.kind,
    statement: input.statement.trim(),
    normalized: normalize(input, d.system.quarter),
    scope: input.scope || "everyone",
    systems: input.systems ?? [],
    approver: input.approver || undefined,
    period: input.period || undefined,
    speaker: personById(d.system, input.speakerId),
    channel: input.channel,
    callId: input.callId,
    assertedAt: iso(now),
    verdict,
    checks,
    history: [{ at: iso(now), verdict, reason: "checked when spoken" }],
    status: "open",
    input,
  };
  d.claims.push(claim);
  const call = input.callId ? d.calls.find((c) => c.id === input.callId) : undefined;
  if (call) {
    call.claimIds.push(claim.id);
    call.updatedAt = iso(now);
  }
  await appendLog(d, now, "claim.asserted", `${claim.speaker.name}: "${claim.statement}" → ${verdict}`, claim.id);
  d.version++;
  return { claim, spoken: spokenVerdict(claim) };
}

export interface ResolveArgs {
  claimId?: string;
  kind?: ClaimKind;
  subject?: string;
  callId?: string;
  resolution: ResolutionKind;
  note: string;
  owner?: string;
  due?: string;
}

// Resolves by id, by the account or system everyone is talking about (one root
// cause usually breaks several claims), or else the newest open claim.
export async function resolveClaims(d: LedgerData, a: ResolveArgs, now: Date) {
  const open = d.claims.filter((c) => c.status !== "resolved" && (!a.callId || c.callId === a.callId));
  let targets: Claim[] = [];
  if (a.claimId) targets = d.claims.filter((c) => c.id === a.claimId);
  if (!targets.length && a.subject) {
    const s = a.subject.toLowerCase();
    targets = open.filter((c) => c.checks.some((k) => k.exceptions.some((f) => f.subject.toLowerCase().includes(s) || s.includes(f.subject.toLowerCase()))));
  }
  if (!targets.length && a.kind) targets = open.filter((c) => c.kind === a.kind).slice(-1);
  if (!targets.length && a.kind) {
    targets = d.claims.filter((c) => c.kind === a.kind && (!a.callId || c.callId === a.callId)).slice(-1);
  }
  if (!targets.length) targets = open.filter((c) => c.verdict !== "verified").slice(-1);
  const note = a.note.trim().replace(/\.$/, "");
  for (const c of targets) {
    // A second answer about the same claim adds to the record instead of replacing it.
    c.resolution = c.resolution
      ? { ...c.resolution, note: `${c.resolution.note}; ${note}`, at: iso(now) }
      : { kind: a.resolution, note, owner: a.owner || undefined, due: a.due || undefined, at: iso(now) };
    c.status = "resolved";
    await appendLog(d, now, "claim.resolved", `${c.id}: ${a.resolution.replace("_", " ")} by ${a.owner || c.speaker.name}`, c.id);
  }
  if (targets.length) d.version++;
  return targets;
}

// Re-run every claim against current state. A claim that gets worse has
// drifted: what someone said is no longer true, so Sworn queues a callback.
export async function reverifyAll(d: LedgerData, now: Date, reason: string) {
  d.system.asOf = iso(now);
  const changed: { claim: Claim; from: Verdict; to: Verdict }[] = [];
  for (const c of d.claims) {
    const { checks, verdict } = await runChecks(c.input, d.system);
    const from = c.verdict;
    c.checks = checks;
    if (verdict === from) continue;
    c.verdict = verdict;
    c.history.push({ at: iso(now), verdict, reason });
    changed.push({ claim: c, from, to: verdict });
    if (RANK[verdict] < RANK[from]) {
      c.status = "drifted";
      d.callbacks.push({
        id: `CB-${d.callbacks.length + 1}`,
        claimId: c.id,
        personId: c.speaker.id,
        reason: `On ${new Date(c.assertedAt).toUTCString().slice(5, 16)} you said: "${c.normalized}" As of now that no longer holds: ${checks.flatMap((k) => k.exceptions).filter((f) => f.severity !== "low").map((f) => f.detail).join(" ")}`,
        at: iso(now),
        status: "pending",
      });
      await appendLog(d, now, "claim.drifted", `${c.id} ${from} → ${verdict}: ${reason}`, c.id);
    } else {
      if (verdict === "verified") c.status = "resolved";
      await appendLog(d, now, "claim.reverified", `${c.id} ${from} → ${verdict}: ${reason}`, c.id);
    }
  }
  d.version++;
  return changed;
}

export type Scenario = "contractor_removed" | "new_admin_without_mfa" | "admin_bypass_closed";

export async function applyScenario(d: LedgerData, name: Scenario, now: Date) {
  const s = d.system;
  let reason: string;
  if (name === "contractor_removed") {
    s.aws.iamUsers = s.aws.iamUsers.filter((u) => u.name !== "jsmith-contractor");
    reason = "jsmith-contractor deleted from AWS IAM";
  } else if (name === "new_admin_without_mfa") {
    if (!s.aws.iamUsers.some((u) => u.name === "tmp-admin-debug")) {
      s.aws.iamUsers.push({ name: "tmp-admin-debug", human: true, consoleAccess: true, mfa: false, createdAt: iso(now), accessKeyLastUsed: iso(now) });
    }
    reason = "new IAM user tmp-admin-debug created with console access and no MFA";
  } else {
    s.github.repos = s.github.repos.map((r) => ({ ...r, enforceAdmins: true }));
    reason = "enforce_admins turned on for infra-terraform";
  }
  await appendLog(d, now, "system.changed", reason);
  return { reason, changed: await reverifyAll(d, now, reason) };
}

export function startCall(d: LedgerData, c: Omit<CallRecord, "turns" | "claimIds" | "updatedAt">, now: Date): CallRecord {
  const call: CallRecord = { ...c, turns: [], claimIds: [], updatedAt: iso(now) };
  d.calls.unshift(call);
  d.calls.splice(25);
  d.version++;
  return call;
}

export function addTurn(d: LedgerData, callId: string, turn: Omit<Turn, "at">, now: Date) {
  const call = d.calls.find((c) => c.id === callId);
  if (!call) return;
  call.turns.push({ ...turn, at: iso(now) });
  call.updatedAt = iso(now);
  d.version++;
}

// Tool calls carry the Bolna execution id when the LLM passes it; calls placed
// outside Sworn (dashboard tests) get a record on first contact.
export function callFor(d: LedgerData, executionId: string | undefined, kind: CallRecord["kind"], now: Date) {
  if (executionId && /^[0-9a-f-]{16,}$/i.test(executionId)) {
    return d.calls.find((c) => c.id === executionId)
      ?? startCall(d, { id: executionId, kind, status: "in-progress", personId: kind === "auditor" ? "auditor" : "priya", reason: kind === "auditor" ? "Auditor line" : "Control owner call", startedAt: iso(now) }, now);
  }
  return d.calls.find((c) => c.kind === kind && !TERMINAL.has(c.status));
}

const TERMINAL = new Set(["completed", "failed", "no-answer", "busy", "error", "canceled", "stopped", "call-disconnected"]);

function parseTranscript(text: string): Turn[] {
  return text
    .split(/\n+/)
    .map((line) => line.match(/^\s*(assistant|agent|bot|user|human)\s*:\s*(.*)$/i))
    .filter((m): m is RegExpMatchArray => !!m && !!m[2].trim())
    .map((m) => ({ role: /assistant|agent|bot/i.test(m[1]) ? "agent" : "engineer", text: m[2].trim(), at: "" }));
}

// Bolna posts the execution object on every status change; treat each as the latest state.
export function applyBolnaExecution(d: LedgerData, p: Record<string, any>, now: Date) {
  const id = String(p.execution_id ?? p.id ?? "");
  if (!id) return { call: undefined, finished: false };
  let call = d.calls.find((c) => c.id === id);
  if (!call) {
    call = startCall(d, { id, kind: "interview", status: "unknown", personId: "priya", reason: "call started outside Sworn", startedAt: p.created_at ?? iso(now) }, now);
  }
  const wasTerminal = TERMINAL.has(call.status);
  call.status = String(p.status ?? call.status);
  call.updatedAt = iso(now);
  if (typeof p.transcript === "string" && p.transcript.trim()) {
    call.transcript = p.transcript;
    const turns = parseTranscript(p.transcript);
    if (turns.length) {
      const toolTurns = call.turns.filter((t) => t.role === "tool");
      call.turns = [...turns.map((t) => ({ ...t, role: call!.kind === "auditor" && t.role === "engineer" ? ("auditor" as const) : t.role, at: call!.updatedAt })), ...toolTurns];
    }
  }
  const rec = p.telephony_data?.recording_url;
  if (rec) call.recordingUrl = rec;
  if (p.conversation_duration != null) call.durationSec = Math.round(Number(p.conversation_duration));
  d.version++;
  return { call, finished: !wasTerminal && TERMINAL.has(call.status) && call.status !== "call-disconnected" };
}

export async function sealCall(d: LedgerData, callId: string, key: SigningKey, now: Date) {
  const call = d.calls.find((c) => c.id === callId);
  if (!call || call.packetId) return undefined;
  const transcript = call.transcript ?? call.turns.map((t) => `${t.role}: ${t.text}`).join("\n");
  const claims = d.claims.filter((c) => call.claimIds.includes(c.id)).map(({ input: _i, history: _h, ...rest }) => rest);
  const packetId = `PKT-${String(d.packets.length + 1).padStart(3, "0")}`;
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const shareToken = [...tokenBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  d.packetTokens[packetId] = shareToken;
  await appendLog(d, now, "packet.sealed", `${packetId}: ${claims.length} claims from call ${call.id.slice(0, 8)}`, packetId);
  const body: Packet = {
    packetId,
    format: "sworn.packet/v1",
    company: d.system.company,
    issuedAt: iso(now),
    call: {
      id: call.id, kind: call.kind, startedAt: call.startedAt, durationSec: call.durationSec,
      recordingUrl: call.recordingUrl, transcriptSha256: await sha256(transcript),
    },
    claims,
    logHead: d.log.at(-1)!.hash,
  };
  const sealed = await seal(body, key);
  d.packets.unshift(sealed);
  call.packetId = packetId;
  d.version++;
  return sealed;
}

export async function freshLedger(now: Date): Promise<LedgerData> {
  const d: LedgerData = { system: seedState(now), claims: [], calls: [], packets: [], packetTokens: {}, callbacks: [], log: [], seq: 0, version: 1 };
  await appendLog(d, now, "ledger.created", `Ledger opened for ${d.system.company}`);
  // Two claims from last quarter's interviews, so the auditor line has history.
  const past = new Date(now.getTime() - 41 * 86_400_000);
  await assertClaim(d, {
    kind: "encryption.at_rest", channel: "call", speakerId: "dev",
    statement: "Everything at rest is KMS-encrypted, RDS and the S3 buckets, three keys, rotation's on.",
  }, past);
  const peer = await assertClaim(d, {
    kind: "change.peer_review", channel: "call", speakerId: "dev",
    statement: "Nothing hits prod without a PR approval and green CI. Terraform included.",
  }, past);
  await resolveClaims(d, {
    claimId: peer.claim.id, resolution: "approved_exception", owner: "Dev Shah",
    note: "Admin bypass on infra-terraform is break-glass for state-lock recovery; every bypass is reviewed in the weekly change meeting",
  }, past);
  d.system.asOf = iso(now);
  return d;
}

export function publicView(d: LedgerData) {
  const s = d.system;
  return {
    version: d.version,
    company: s.company,
    quarter: s.quarter,
    asOf: s.asOf,
    people: s.people,
    systems: {
      awsIamUsers: s.aws.iamUsers.length,
      awsIamWithoutMfa: s.aws.iamUsers.filter((u) => !u.mfa).map((u) => u.name),
      oktaActive: s.okta.users.filter((u) => u.status === "ACTIVE").length,
      oktaDeprovisioned: s.okta.users.filter((u) => u.status === "DEPROVISIONED").map((u) => u.login),
      prodRepos: s.github.repos.length,
      dataStores: s.aws.datastores.length,
    },
    claims: [...d.claims].reverse().map((full) => { const { input: _i, ...c } = full; return { ...c, plain: plainSummary(full) }; }),
    calls: d.calls.map((c) => ({ ...c, to: c.to ? c.to.replace(/\d(?=\d{4})/g, "•") : undefined })),
    packets: d.packets.map((p) => ({ packetId: p.body.packetId, verifyToken: d.packetTokens[p.body.packetId], issuedAt: p.body.issuedAt, sha256: p.sha256, claims: p.body.claims.length, callId: p.body.call.id })),
    callbacks: d.callbacks.filter((c) => c.status === "pending"),
    log: d.log.slice(-40).reverse(),
  };
}
