import { sha256 } from "./seal";
import type { SystemState } from "./state";
import type { CheckResult, ClaimInput, ClaimKind, Finding, Verdict } from "./types";

// Deterministic verifiers. A spoken claim is a hypothesis; these read system
// state and return the population, the exceptions, and a hash of what was read.

const DAY = 86_400_000;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const calendarDay = (iso: string) => Date.parse(iso.slice(0, 10));
const daysBetween = (a: string, b: string) => Math.round((calendarDay(b) - calendarDay(a)) / DAY);

export function verdictOf(checks: CheckResult[]): Verdict {
  const findings = checks.flatMap((c) => c.exceptions);
  if (checks.length === 0) return "unverifiable";
  if (findings.length === 0) return "verified";
  if (findings.some((f) => f.severity === "high")) return "contradicted";
  return "partial";
}

async function result(
  partial: Omit<CheckResult, "snapshotSha256" | "observedAt">,
  observed: unknown,
  state: SystemState,
): Promise<CheckResult> {
  return { ...partial, observedAt: state.asOf, snapshotSha256: await sha256({ observed, asOf: state.asOf }) };
}

function wants(systems: string[] | undefined, name: string) {
  return !systems?.length || systems.some((s) => s.toLowerCase().includes(name));
}

function offboardingNote(state: SystemState, oktaLogin?: string, keyLastUsed?: string) {
  const okta = state.okta.users.find((u) => u.login === oktaLogin);
  if (!okta || okta.status !== "DEPROVISIONED" || !okta.deactivatedAt) return "";
  let note = ` Its owner was deactivated in Okta on ${fmtDate(okta.deactivatedAt)}`;
  if (keyLastUsed && keyLastUsed > okta.deactivatedAt) {
    note += `, yet its access key was last used on ${fmtDate(keyLastUsed)}, ${daysBetween(okta.deactivatedAt, keyLastUsed)} days later`;
  }
  return note + ".";
}

async function checkMfa(input: ClaimInput, state: SystemState): Promise<CheckResult[]> {
  const scope = (input.scope ?? "everyone").toLowerCase();
  const humansOnly = /human|people|console|employee|staff|workforce/.test(scope);
  const out: CheckResult[] = [];

  if (wants(input.systems, "okta")) {
    const active = state.okta.users.filter((u) => u.status === "ACTIVE");
    const missing = active.filter((u) => !u.mfaEnrolled || !state.okta.mfaPolicy.enforced);
    out.push(await result({
      checkId: "okta.mfa_policy", system: "Okta", source: `Okta policy "${state.okta.mfaPolicy.name}" + active user list`,
      population: active.length, passing: active.length - missing.length, populationLabel: "active Okta users",
      exceptions: missing.map((u) => ({
        id: `okta-mfa-${u.login}`, system: "Okta", subject: u.login, severity: "high" as const,
        detail: `${u.name} has no MFA factor enrolled.`, evidenceRef: `okta:user/${u.login}`,
      })),
      evidenceRefs: [`okta:policy/${state.okta.mfaPolicy.name}`, "okta:users?status=ACTIVE"],
    }, { policy: state.okta.mfaPolicy, active: active.map((u) => [u.login, u.mfaEnrolled]) }, state));
  }

  if (wants(input.systems, "aws") || wants(input.systems, "iam")) {
    const users = state.aws.iamUsers.filter((u) => !humansOnly || u.human || u.consoleAccess);
    const exceptions: Finding[] = users.filter((u) => !u.mfa).map((u) =>
      u.consoleAccess
        ? {
            id: `iam-mfa-${u.name}`, system: "AWS IAM", subject: u.name, severity: "high",
            detail: `IAM user ${u.name} has console access and no MFA device.${offboardingNote(state, u.oktaLogin, u.accessKeyLastUsed)}`,
            evidenceRef: `aws:iam:credential-report@${state.asOf}#${u.name}`,
          }
        : {
            id: `iam-mfa-${u.name}`, system: "AWS IAM", subject: u.name, severity: "low",
            detail: `${u.name} is a non-interactive service principal (no console). MFA does not apply; it needs a documented exception and key rotation.`,
            evidenceRef: `aws:iam:credential-report@${state.asOf}#${u.name}`,
          },
    );
    out.push(await result({
      checkId: "aws.iam_mfa", system: "AWS IAM", source: `IAM credential report, account ${state.aws.accountAlias}`,
      population: users.length, passing: users.length - exceptions.length,
      populationLabel: humansOnly ? "IAM users with console access" : "IAM users",
      exceptions, evidenceRefs: [`aws:iam:credential-report@${state.asOf}`],
    }, users.map((u) => [u.name, u.mfa, u.consoleAccess]), state));
  }
  return out;
}

async function checkAccessReview(input: ClaimInput, state: SystemState): Promise<CheckResult[]> {
  const period = input.period || state.quarter;
  const ticket = state.linear.tickets.find((t) => /access review/i.test(t.title) && t.title.includes(period.slice(0, 2)));
  const exceptions: Finding[] = [];
  if (!ticket || ticket.status !== "Done") {
    exceptions.push({
      id: "review-missing", system: "Linear", subject: period, severity: "high",
      detail: `No completed access review ticket for ${period}.`, evidenceRef: "linear:search?q=access+review",
    });
  } else {
    const claimed = input.approver?.trim().split(/\s+/)[0]?.toLowerCase();
    if (claimed && !ticket.approver?.toLowerCase().includes(claimed)) {
      exceptions.push({
        id: "review-approver", system: "Linear", subject: ticket.id, severity: "medium",
        detail: `The claimed approver (${input.approver}) is not who approved ${ticket.id} (${ticket.approver}).`,
        evidenceRef: `linear:${ticket.id}`,
      });
    }
    const removedInOkta = state.okta.users.filter((u) => u.status === "DEPROVISIONED");
    for (const u of removedInOkta) {
      const iam = state.aws.iamUsers.find((i) => i.oktaLogin === u.login);
      if (iam) {
        exceptions.push({
          id: `review-followup-${iam.name}`, system: "AWS IAM", subject: iam.name, severity: "medium",
          detail: `The review decided to remove ${u.name}, but IAM user ${iam.name} is still active, so the review's outcome was not fully carried out.`,
          evidenceRef: `aws:iam:credential-report@${state.asOf}#${iam.name}`,
        });
      }
    }
  }
  return [await result({
    checkId: "linear.access_review", system: "Linear + AWS IAM", source: ticket ? `${ticket.id}: ${ticket.title}` : "Linear search",
    population: 3, passing: ticket?.status === "Done" ? 3 : 0, populationLabel: "systems in review scope (Okta, AWS, GitHub)",
    exceptions, evidenceRefs: ticket ? [`linear:${ticket.id}`, `linear:${ticket.id}#approval`] : [],
  }, { ticket, iam: state.aws.iamUsers.map((u) => u.name) }, state)];
}

async function checkDeprovisioned(input: ClaimInput, state: SystemState): Promise<CheckResult[]> {
  const cutoff = new Date(new Date(state.asOf).getTime() - 30 * DAY).toISOString();
  const departed = state.okta.users.filter((u) => u.status === "DEPROVISIONED" && (u.deactivatedAt ?? "") >= cutoff);
  const exceptions: Finding[] = [];
  for (const u of departed) {
    const iam = state.aws.iamUsers.find((i) => i.oktaLogin === u.login);
    if (iam) {
      exceptions.push({
        id: `deprov-${iam.name}`, system: "AWS IAM", subject: iam.name, severity: "high",
        detail: `${u.name} was deactivated in Okta, but IAM user ${iam.name} is still active${iam.consoleAccess ? " with console access" : ""}.${offboardingNote(state, u.login, iam.accessKeyLastUsed)}`,
        evidenceRef: `aws:iam:credential-report@${state.asOf}#${iam.name}`,
      });
    }
  }
  return [await result({
    checkId: "okta_aws.deprovisioning", system: "Okta + AWS IAM", source: "Okta deactivation events joined to the IAM credential report",
    population: departed.length, passing: departed.length - exceptions.length, populationLabel: "people offboarded in the last 30 days",
    exceptions, evidenceRefs: ["okta:system-log?eventType=user.lifecycle.deactivate", `aws:iam:credential-report@${state.asOf}`],
  }, { departed: departed.map((u) => [u.login, u.deactivatedAt]), iam: state.aws.iamUsers.map((u) => u.name) }, state)];
}

async function checkPeerReview(_input: ClaimInput, state: SystemState): Promise<CheckResult[]> {
  const repos = state.github.repos.filter((r) => r.prod);
  const exceptions: Finding[] = [];
  for (const r of repos) {
    if (r.requiredApprovals < 1 || !r.statusChecks) {
      exceptions.push({
        id: `bp-${r.name}`, system: "GitHub", subject: r.name, severity: "high",
        detail: `${r.name} does not require an approving review and passing checks before merge.`,
        evidenceRef: `github:${state.github.org}/${r.name}/branch-protection`,
      });
    } else if (!r.enforceAdmins) {
      exceptions.push({
        id: `bp-admin-${r.name}`, system: "GitHub", subject: r.name, severity: "medium",
        detail: `Admins can bypass review on ${r.name} (enforce_admins is off); ${r.adminBypasses90d} admin bypass in the last 90 days.`,
        evidenceRef: `github:${state.github.org}/${r.name}/branch-protection`,
      });
    }
  }
  return [await result({
    checkId: "github.branch_protection", system: "GitHub", source: `Branch protection on default branches, org ${state.github.org}`,
    population: repos.length, passing: repos.length - exceptions.length, populationLabel: "production repositories",
    exceptions, evidenceRefs: repos.map((r) => `github:${state.github.org}/${r.name}/branch-protection`),
  }, repos, state)];
}

async function checkEncryption(_input: ClaimInput, state: SystemState): Promise<CheckResult[]> {
  const stores = state.aws.datastores;
  const exceptions: Finding[] = stores.filter((s) => !s.encrypted).map((s) => ({
    id: `enc-${s.id}`, system: "AWS", subject: s.id, severity: "high" as const,
    detail: `${s.id} is not encrypted at rest.`, evidenceRef: `aws:config/${s.id}`,
  }));
  return [await result({
    checkId: "aws.encryption_at_rest", system: "AWS", source: "AWS Config: RDS StorageEncrypted, S3 default encryption",
    population: stores.length, passing: stores.length - exceptions.length, populationLabel: "production data stores",
    exceptions, evidenceRefs: stores.map((s) => `aws:config/${s.id}`),
  }, stores, state)];
}

const CHECKS: Record<ClaimKind, (i: ClaimInput, s: SystemState) => Promise<CheckResult[]>> = {
  "mfa.enforced": checkMfa,
  "access_review.completed": checkAccessReview,
  "accounts.deprovisioned": checkDeprovisioned,
  "change.peer_review": checkPeerReview,
  "encryption.at_rest": checkEncryption,
};

export async function runChecks(input: ClaimInput, state: SystemState) {
  const checks = await CHECKS[input.kind](input, state);
  return { checks, verdict: verdictOf(checks) };
}

// Fallback for typed text input; on calls, Bolna's LLM fills claim_kind itself.
export function inferKind(text: string): ClaimKind | null {
  const t = text.toLowerCase();
  if (/\bmfa\b|2fa|multi.?factor|two.?factor|yubikey|passkey|authenticat/.test(t)) return "mfa.enforced";
  if (/access review|user review|recertif|reviewed (all )?(access|accounts|users)/.test(t)) return "access_review.completed";
  if (/offboard|deprovision|remov|revok|stale account|nuked|disabled (the )?(account|user)/.test(t)) return "accounts.deprovisioned";
  if (/pull request|\bprs?\b|code review|peer review|branch protection|approval before merge/.test(t)) return "change.peer_review";
  if (/encrypt|kms|at rest/.test(t)) return "encryption.at_rest";
  return null;
}

export function normalize(input: ClaimInput, quarter: string): string {
  const systems = input.systems?.length ? input.systems.join(", ") : "all in-scope systems";
  switch (input.kind) {
    case "mfa.enforced":
      return `MFA is enforced for ${input.scope || "everyone"} across ${systems}.`;
    case "access_review.completed":
      return `The ${input.period || quarter} user access review was completed${input.approver ? ` and approved by ${input.approver}` : ""}.`;
    case "accounts.deprovisioned":
      return `Access was removed for ${input.scope || "every departed user"} across ${systems}.`;
    case "change.peer_review":
      return "Every production change requires peer review and passing checks before merge.";
    case "encryption.at_rest":
      return "Production data stores are encrypted at rest.";
  }
}
