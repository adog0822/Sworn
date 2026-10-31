import { describe, expect, it } from "vitest";
import { answerAuditor } from "../src/core/answer";
import { inferKind } from "../src/core/checks";
import { applyScenario, assertClaim, freshLedger, resolveClaims, sealCall, startCall } from "../src/core/engine";
import { render } from "../src/core/render";
import { REPLAY, runReplayStep } from "../src/core/replay";
import { canonical, loadSigningKey, verifySealed } from "../src/core/seal";

const NOW = new Date("2026-10-30T14:00:00Z");

async function testKey() {
  const { privateKey } = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return loadSigningKey(JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)));
}

describe("checks", () => {
  it("contradicts 'MFA for everyone' with the contractor and lists service accounts as minor", async () => {
    const d = await freshLedger(NOW);
    const { claim, spoken } = await assertClaim(d, { kind: "mfa.enforced", statement: "MFA is enforced for everyone", scope: "everyone", channel: "web" }, NOW);
    expect(claim.verdict).toBe("contradicted");
    const findings = claim.checks.flatMap((c) => c.exceptions);
    expect(findings.map((f) => f.subject).sort()).toEqual(["jsmith-contractor", "svc-backup", "svc-deploy"]);
    expect(findings.find((f) => f.subject === "jsmith-contractor")!.detail).toMatch(/deactivated in Okta.*4 days later/);
    expect(spoken.say).toMatch(/doesn't match/);
  });

  it("verifies human-only MFA once the contractor is gone", async () => {
    const d = await freshLedger(NOW);
    await applyScenario(d, "contractor_removed", NOW);
    const { claim } = await assertClaim(d, { kind: "mfa.enforced", statement: "every human uses MFA", scope: "human users", channel: "web" }, NOW);
    expect(claim.verdict).toBe("verified");
  });

  it("catches a claimed approver who did not approve", async () => {
    const d = await freshLedger(NOW);
    const { claim } = await assertClaim(d, { kind: "access_review.completed", statement: "Ana approved the review", approver: "Ana", channel: "web" }, NOW);
    expect(claim.checks[0].exceptions.some((f) => f.id === "review-approver")).toBe(true);
  });

  it("maps free text to claim kinds", () => {
    expect(inferKind("we nuked three stale accounts")).toBe("accounts.deprovisioned");
    expect(inferKind("MFA is on for everyone")).toBe("mfa.enforced");
    expect(inferKind("all PRs need an approval")).toBe("change.peer_review");
    expect(inferKind("lunch was good")).toBeNull();
  });
});

describe("drift", () => {
  it("re-verifies on fix and queues a callback when a claim stops being true", async () => {
    const d = await freshLedger(NOW);
    const { claim } = await assertClaim(d, { kind: "accounts.deprovisioned", statement: "removed all leavers", channel: "web" }, NOW);
    expect(claim.verdict).toBe("contradicted");
    await applyScenario(d, "contractor_removed", NOW);
    expect(claim.verdict).toBe("verified");
    const mfa = (await assertClaim(d, { kind: "mfa.enforced", statement: "humans have MFA", scope: "human users", channel: "web" }, NOW)).claim;
    expect(mfa.verdict).toBe("verified");
    await applyScenario(d, "new_admin_without_mfa", NOW);
    expect(mfa.verdict).toBe("contradicted");
    expect(mfa.status).toBe("drifted");
    expect(d.callbacks.at(-1)!.claimId).toBe(mfa.id);
  });
});

describe("rendering", () => {
  it("renders one claim in every dialect without inventing facts", async () => {
    const d = await freshLedger(NOW);
    const { claim } = await assertClaim(d, { kind: "mfa.enforced", statement: "MFA for everyone", channel: "web" }, NOW);
    const soc2 = render(claim, "auditor", "soc2");
    expect(soc2).toContain("CC6.1");
    expect(soc2).toContain("Exception noted");
    expect(soc2).toContain("inquiry alone is not relied upon");
    expect(render(claim, "auditor", "iso27001")).toContain("A.8.5");
    expect(render(claim, "auditor", "pcidss")).toContain("8.4.2");
    expect(render(claim, "buyer")).toMatch(/^Q: .*\nA: Partially/);
    expect(render(claim, "board")).toMatch(/former contractor/);
  });

  it("auditor line answers only from verified records", async () => {
    const d = await freshLedger(NOW);
    expect(answerAuditor("How do you handle encryption at rest?", d.claims).answer).toMatch(/6 of 6/);
    expect(answerAuditor("How do you handle terminations?", d.claims).answer).toMatch(/No control owner has made a verified statement/);
    expect(answerAuditor("What's your favorite color?", d.claims).kind).toBeNull();
  });
});

describe("replay + sealing", () => {
  it("runs the scripted call end to end and seals a verifiable packet", async () => {
    const d = await freshLedger(NOW);
    const call = startCall(d, { id: "replay-1", kind: "replay", status: "in-progress", personId: "priya", reason: "test", startedAt: NOW.toISOString() }, NOW);
    for (let i = 0; i < REPLAY.length; i++) await runReplayStep(d, call.id, i, NOW);
    const claims = d.claims.filter((c) => call.claimIds.includes(c.id));
    expect(claims.map((c) => c.kind)).toEqual(["access_review.completed", "accounts.deprovisioned", "mfa.enforced"]);
    expect(claims.every((c) => c.status === "resolved")).toBe(true);
    expect(claims.find((c) => c.kind === "mfa.enforced")!.resolution!.note).toMatch(/svc-deploy/);

    const key = await testKey();
    const sealed = (await sealCall(d, call.id, key, NOW))!;
    expect(sealed.body.claims).toHaveLength(3);
    expect((await verifySealed(sealed, key.publicJwk)).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(sealed));
    tampered.body.claims[1].verdict = "verified";
    expect((await verifySealed(tampered, key.publicJwk)).ok).toBe(false);
  });

  it("hash-chains the log", async () => {
    const d = await freshLedger(NOW);
    for (let i = 1; i < d.log.length; i++) expect(d.log[i].prev).toBe(d.log[i - 1].hash);
  });

  it("canonicalizes key order", () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
});

describe("resolution", () => {
  it("resolves every open claim that shares a root cause", async () => {
    const d = await freshLedger(NOW);
    for (const kind of ["accounts.deprovisioned", "mfa.enforced"] as const) {
      await assertClaim(d, { kind, statement: "x", channel: "web", callId: "c1" }, NOW);
    }
    const resolved = await resolveClaims(d, { subject: "jsmith-contractor", resolution: "remediation", note: "delete", callId: "c1" }, NOW);
    expect(resolved).toHaveLength(2);
  });
});
