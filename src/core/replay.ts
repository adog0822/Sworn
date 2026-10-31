import { addTurn, assertClaim, resolveClaims, type LedgerData } from "./engine";
import type { ClaimInput, ResolutionKind } from "./types";

// A scripted control-owner call that runs through the same engine as a live
// Bolna call, for anyone judging the demo without a phone.

type Ctx = { quarter: string; said: Record<string, string> };
type Step =
  | { role: "agent" | "engineer"; text: string | ((c: Ctx) => string); pauseMs: number }
  | { verify: Omit<ClaimInput, "channel" | "callId" | "speakerId">; pauseMs: number }
  | { resolve: { subject?: string; kind?: ClaimInput["kind"]; resolution: ResolutionKind; owner: string; due?: string; note: string }; pauseMs: number };

export const REPLAY: Step[] = [
  {
    role: "agent", pauseMs: 2600,
    text: (c) => `Hi Priya, it's Sworn, Quillfeather's compliance line. This call is recorded for the audit record. It's time for the ${c.quarter} access review. Walk me through what you did, in your own words.`,
  },
  {
    role: "engineer", pauseMs: 4200,
    text: "Yeah, so we ran the review last week. Pulled everyone from Okta and AWS, Raj signed off in Linear. We nuked three stale accounts, and MFA's enforced for everyone through Okta.",
  },
  { verify: { kind: "access_review.completed", statement: "We ran the review last week, pulled everyone from Okta and AWS, Raj signed off in Linear.", approver: "Raj", systems: ["okta", "aws"] }, pauseMs: 900 },
  { verify: { kind: "accounts.deprovisioned", statement: "We nuked three stale accounts.", scope: "the three departed users", systems: ["okta", "aws"] }, pauseMs: 900 },
  { verify: { kind: "mfa.enforced", statement: "MFA's enforced for everyone through Okta.", scope: "everyone", systems: ["okta", "aws"] }, pauseMs: 1400 },
  {
    role: "agent", pauseMs: 6200,
    text: (c) => `The review itself checks out: SEC-214, approved by Raj Patel. But one account breaks three of your statements. ${c.said["accounts.deprovisioned"] ?? ""} Is it still needed, and did anyone approve keeping it?`,
  },
  {
    role: "engineer", pauseMs: 3600,
    text: "Oh no. No, that's the contractor's old CI user. It should've gone with the Okta account. Nobody approved that. I'll delete it and rotate anything it could reach, today.",
  },
  {
    resolve: {
      subject: "jsmith-contractor", resolution: "remediation", owner: "Priya Raman", due: "today",
      note: "IAM user jsmith-contractor was missed in offboarding; delete it and rotate every secret it could reach",
    },
    pauseMs: 900,
  },
  {
    role: "agent", pauseMs: 3800,
    text: "Logged as a remediation you own, due today. One more an auditor will ask: svc-deploy and svc-backup have no MFA. Are those documented service accounts?",
  },
  {
    role: "engineer", pauseMs: 3000,
    text: "Yep, both are CI service principals. No console, keys rotate every ninety days, and they're in the exceptions register.",
  },
  {
    resolve: {
      kind: "mfa.enforced", resolution: "approved_exception", owner: "Priya Raman",
      note: "svc-deploy and svc-backup are non-interactive CI principals with no console access; keys rotate every 90 days; listed in the exceptions register",
    },
    pauseMs: 900,
  },
  {
    role: "agent", pauseMs: 4200,
    text: "Here's what your auditor gets: the review was performed and approved, one offboarding gap we found before fieldwork with a fix due today, and the service accounts documented. I'll re-check AWS tonight and call you if anything drifts. Thanks, Priya.",
  },
];

export async function runReplayStep(d: LedgerData, callId: string, index: number, now: Date) {
  const step = REPLAY[index];
  if (!step) return { done: true, pauseMs: 0 };
  const call = d.calls.find((c) => c.id === callId);
  const ctx: Ctx = { quarter: d.system.quarter, said: {} };
  for (const c of d.claims.filter((x) => call?.claimIds.includes(x.id))) {
    const top = c.checks.flatMap((k) => k.exceptions).find((f) => f.severity === "high");
    if (top) ctx.said[c.kind] = top.detail;
  }
  if ("role" in step) {
    addTurn(d, callId, { role: step.role, text: typeof step.text === "function" ? step.text(ctx) : step.text }, now);
  } else if ("verify" in step) {
    const { claim, spoken } = await assertClaim(d, { ...step.verify, channel: "replay", callId, speakerId: "priya" }, now);
    addTurn(d, callId, { role: "tool", text: `verify_claim → ${claim.id} ${claim.verdict.toUpperCase()}: ${spoken.say}` }, now);
  } else {
    const resolved = await resolveClaims(d, { ...step.resolve, callId }, now);
    addTurn(d, callId, { role: "tool", text: `resolve_claim → ${resolved.map((c) => c.id).join(", ") || "no open claim"}: ${step.resolve.resolution.replace("_", " ")}` }, now);
  }
  return { done: index >= REPLAY.length - 1, pauseMs: step.pauseMs };
}
