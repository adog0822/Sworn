import { inferKind } from "./checks";
import { controlLabel, FRAMEWORKS } from "./crosswalk";
import type { Claim, ClaimKind, Framework } from "./types";

// The auditor line. It answers only from claims that were corroborated against
// system state, and says so plainly when no such claim exists.

const TOPICS: [RegExp, ClaimKind][] = [
  [/least privilege|access review|who has access|recertif|user review/, "access_review.completed"],
  [/terminat|leaver|offboard|depart|revok|deprovision/, "accounts.deprovisioned"],
  [/change|deploy|merge|pull request|code review/, "change.peer_review"],
  [/encrypt|at rest|kms/, "encryption.at_rest"],
  [/mfa|multi.?factor|two.?factor|authenticat|login/, "mfa.enforced"],
];

export function topicOf(question: string): ClaimKind | null {
  const q = question.toLowerCase();
  for (const [re, kind] of TOPICS) if (re.test(q)) return kind;
  return inferKind(q);
}

export function answerAuditor(question: string, claims: Claim[], fw: Framework = "soc2") {
  const kind = topicOf(question);
  const meta = FRAMEWORKS[fw];
  if (!kind) {
    return {
      kind: null,
      cites: [] as string[],
      answer: "I can only answer from verified records, and that question doesn't map to a control I hold evidence for. I've logged it for the compliance owner.",
    };
  }
  const matching = claims.filter((c) => c.kind === kind).sort((a, b) => (a.assertedAt < b.assertedAt ? 1 : -1));
  const c = matching[0];
  if (!c) {
    return {
      kind,
      cites: [],
      answer: `No control owner has made a verified statement on that yet, so I won't characterize it. Sworn will call the owner and add a verified answer under ${meta.name} ${controlLabel(kind, fw)}.`,
    };
  }
  const k = c.checks[0];
  const exceptions = c.checks.flatMap((x) => x.exceptions);
  const open = exceptions.filter((f) => f.severity !== "low");
  const parts = [
    `Under ${meta.name} ${controlLabel(kind, fw)}: ${c.speaker.name} stated that ${c.normalized.charAt(0).toLowerCase()}${c.normalized.slice(1)}`,
    k ? `I checked that against ${k.source}: ${k.passing} of ${k.population} ${k.populationLabel} pass.` : "",
    open.length
      ? `There ${open.length === 1 ? "is" : "are"} ${open.length} open exception${open.length === 1 ? "" : "s"}: ${open.map((f) => f.subject).join(", ")}.`
      : exceptions.length
        ? `The only exceptions are documented service principals: ${exceptions.map((f) => f.subject).join(", ")}.`
        : "No exceptions.",
    c.resolution ? `Management response: ${c.resolution.note}.` : "",
    `The record is claim ${c.id}, signed, with the call recording and the system snapshot attached.`,
  ];
  return { kind, cites: [c.id], answer: parts.filter(Boolean).join(" ") };
}
