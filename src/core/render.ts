import { controlLabel, controlsFor, FRAMEWORKS } from "./crosswalk";
import type { Claim, Dialect, Finding, Framework } from "./types";

// Renderers are templates over typed, verified facts. No model writes these
// sentences, so nothing here can say more than the checks found.

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

const findings = (c: Claim): Finding[] => c.checks.flatMap((k) => k.exceptions);
const blocking = (c: Claim) => findings(c).filter((f) => f.severity !== "low");

function populationLine(c: Claim): string {
  return c.checks
    .map((k) => `${k.source}: ${k.passing} of ${k.population} ${k.populationLabel} pass`)
    .join("; ");
}

function resolutionLine(c: Claim): string {
  const r = c.resolution;
  if (!r) return "";
  const who = r.owner ? ` Owner: ${r.owner}.` : "";
  const due = r.due ? ` Due: ${r.due}.` : "";
  const label = { approved_exception: "Approved exception", remediation: "Remediation committed", disputed: "Disputed by control owner", corrected: "Claim corrected by speaker" }[r.kind];
  return `${label}: ${r.note}.${who}${due}`;
}

export function renderEngineer(c: Claim): string {
  const lines = [`${c.normalized}  [${c.verdict.toUpperCase()}]`];
  for (const k of c.checks) {
    lines.push(`- ${k.system}: ${k.passing}/${k.population} ${k.populationLabel}`);
    for (const f of k.exceptions) lines.push(`  - ${f.subject}: ${f.detail}`);
  }
  if (c.resolution) lines.push(`- ${resolutionLine(c)}`);
  const fix = blocking(c)[0];
  if (fix && !c.resolution) lines.push(`Next: fix ${fix.subject} (${fix.system}), or tell Sworn why it's an approved exception.`);
  return lines.join("\n");
}

export function renderAuditor(c: Claim, fw: Framework): string {
  const meta = FRAMEWORKS[fw];
  const controls = controlsFor(c.kind, fw).map((x) => `${x.id} (${x.title})`).join("; ");
  const fs = findings(c);
  const result = fs.length === 0 ? meta.passWord : fs.every((f) => f.severity === "low") ? `${meta.exceptionWord} (minor)` : meta.exceptionWord;
  const parts = [
    `${meta.name}, ${meta.unit} ${controls}.`,
    `Inquiry: on ${fmt(c.assertedAt)}, ${c.speaker.name} (${c.speaker.role}) represented that ${lowerFirst(c.normalized)}`,
    `Inspection: ${populationLine(c)}. Observed ${fmt(c.checks[0]?.observedAt ?? c.assertedAt)}.`,
  ];
  if (fs.length) {
    parts.push(`Exceptions (${fs.length}): ${fs.map((f, i) => `(${i + 1}) ${f.detail}`).join(" ")}`);
  }
  parts.push(`Result: ${result}.`);
  if (c.resolution) parts.push(`Management response: ${resolutionLine(c)}`);
  parts.push(`Evidence: ${c.checks.flatMap((k) => k.evidenceRefs).slice(0, 4).join(", ")}; snapshot SHA-256 ${c.checks[0]?.snapshotSha256.slice(0, 16)}…`);
  parts.push("Inquiry was corroborated by inspection of system records; the inquiry alone is not relied upon.");
  return parts.join("\n\n");
}

export function renderBuyer(c: Claim): string {
  const q = {
    "mfa.enforced": "Do you enforce multi-factor authentication for all access to production?",
    "access_review.completed": "Do you review user access at least quarterly?",
    "accounts.deprovisioned": "Is access revoked promptly when personnel leave?",
    "change.peer_review": "Are production changes peer reviewed before deployment?",
    "encryption.at_rest": "Is customer data encrypted at rest?",
  }[c.kind];
  const fs = blocking(c);
  const minor = findings(c).filter((f) => f.severity === "low");
  let a: string;
  if (c.verdict === "verified" || (fs.length === 0 && c.resolution)) {
    a = `Yes. Verified against live system records on ${fmt(c.checks[0]?.observedAt ?? c.assertedAt)}: ${populationLine(c)}.`;
  } else if (fs.length === 0) {
    a = `Yes, with ${minor.length} documented exception${minor.length === 1 ? "" : "s"} for non-interactive service principals. ${populationLine(c)}.`;
  } else {
    a = `Partially. ${populationLine(c)}. ${fs.length} open exception${fs.length === 1 ? "" : "s"} ${c.resolution ? `with remediation committed${c.resolution.due ? ` by ${c.resolution.due}` : ""}` : "under remediation"}.`;
  }
  return `Q: ${q}\nA: ${a}\nMaps to: SOC 2 ${controlLabel(c.kind, "soc2")} · ISO 27001 ${controlLabel(c.kind, "iso27001")} · NIST ${controlLabel(c.kind, "nist80053")}.\nProof: claim ${c.id}, signed and independently verifiable.`;
}

export function renderBoard(c: Claim): string {
  const fs = blocking(c);
  if (fs.length === 0) {
    return `${c.normalized.replace(/\.$/, "")}: confirmed. No action needed.`;
  }
  const top = fs[0];
  const risk = top.system === "AWS IAM" ? "a former contractor's credentials could still reach production" : "a control gap an auditor would flag";
  return `1 open issue: ${risk} (${top.subject}). ${c.resolution ? `Fix owned by ${c.resolution.owner ?? "engineering"}${c.resolution.due ? `, due ${c.resolution.due}` : ""}.` : "No owner assigned yet."} Audit impact: an exception under SOC 2 ${controlLabel(c.kind, "soc2")} if it is still open at fieldwork.`;
}

export function render(c: Claim, dialect: Dialect, fw: Framework = "soc2"): string {
  switch (dialect) {
    case "engineer": return renderEngineer(c);
    case "auditor": return renderAuditor(c, fw);
    case "buyer": return renderBuyer(c);
    case "board": return renderBoard(c);
  }
}

// What the voice agent says right after a claim is checked. Spoken, so short.
export function spokenVerdict(c: Claim): { say: string; ask_next: string } {
  const fs = findings(c);
  const high = fs.filter((f) => f.severity !== "low");
  if (fs.length === 0) {
    return { say: `Verified. ${populationLine(c)}. Logged as ${c.id}.`, ask_next: "Move to the next control." };
  }
  if (high.length === 0) {
    return {
      say: `Mostly holds. ${populationLine(c)}. The only exceptions are service accounts without a console: ${fs.map((f) => f.subject).join(" and ")}.`,
      ask_next: "Ask whether those service accounts are documented exceptions and how often their keys rotate.",
    };
  }
  const top = high[0];
  return {
    say: `That doesn't match the records. ${populationLine(c)}. ${top.detail}`,
    ask_next: `Ask, as an auditor would: is ${top.subject} still needed, who approved it staying active, and when will it be removed? Then call resolve_claim with the answer.`,
  };
}

// For people who have never heard of SOC 2: what the claim is about, and what's true.
export const TOPIC: Record<Claim["kind"], string> = {
  "mfa.enforced": "Two-step login",
  "access_review.completed": "Access review",
  "accounts.deprovisioned": "Removing people who left",
  "change.peer_review": "Code review",
  "encryption.at_rest": "Encryption",
};

export function plainSummary(c: Claim): { topic: string; stamp: string; text: string } {
  const open = findings(c).filter((f) => f.severity !== "low");
  const subjects = (fs: Finding[]) => fs.map((f) => f.subject).join(" and ");
  if (open.length === 0) {
    const ok = {
      "mfa.enforced": findings(c).length ? "Every person has a second login step. Only robot accounts are exempt, and that's documented." : "Everyone checked has a second login step.",
      "access_review.completed": "The access review happened and was signed off.",
      "accounts.deprovisioned": "Everyone who left has lost access.",
      "change.peer_review": "Every code change gets a second pair of eyes.",
      "encryption.at_rest": "Stored customer data is encrypted.",
    }[c.kind];
    return { topic: TOPIC[c.kind], stamp: findings(c).length ? "Holds up" : "True", text: ok };
  }
  const bad = {
    "mfa.enforced": `${subjects(open)} can sign in to AWS without a second step.`,
    "access_review.completed": "The review happened, but a decision from it was never carried out.",
    "accounts.deprovisioned": `Someone who left can still get into AWS (${subjects(open)}).`,
    "change.peer_review": `Admins can skip review on ${subjects(open)}.`,
    "encryption.at_rest": `${subjects(open)} isn't encrypted.`,
  }[c.kind];
  return { topic: TOPIC[c.kind], stamp: c.verdict === "contradicted" ? "Not true" : "Not quite", text: bad };
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
