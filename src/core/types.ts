// The interlingua. Every spoken compliance statement becomes one of these typed
// claims; every audience-specific rendering is produced from it, never from raw text.

export type ClaimKind =
  | "mfa.enforced"
  | "access_review.completed"
  | "accounts.deprovisioned"
  | "change.peer_review"
  | "encryption.at_rest";

export type Verdict = "verified" | "partial" | "contradicted" | "unverifiable";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  system: string;
  subject: string;
  detail: string;
  severity: Severity;
  evidenceRef: string;
}

export interface CheckResult {
  checkId: string;
  system: string;
  source: string;
  observedAt: string;
  population: number;
  passing: number;
  populationLabel: string;
  exceptions: Finding[];
  evidenceRefs: string[];
  snapshotSha256: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  location: string;
}

export type ResolutionKind = "approved_exception" | "remediation" | "disputed" | "corrected";

export interface Resolution {
  kind: ResolutionKind;
  note: string;
  owner?: string;
  due?: string;
  at: string;
}

export interface ClaimInput {
  kind: ClaimKind;
  statement: string;
  scope?: string;
  systems?: string[];
  approver?: string;
  period?: string;
  speakerId?: string;
  channel: "call" | "replay" | "web";
  callId?: string;
}

export interface Claim {
  id: string;
  kind: ClaimKind;
  statement: string;
  normalized: string;
  scope: string;
  systems: string[];
  approver?: string;
  period?: string;
  speaker: Person;
  channel: ClaimInput["channel"];
  callId?: string;
  assertedAt: string;
  verdict: Verdict;
  checks: CheckResult[];
  history: { at: string; verdict: Verdict; reason: string }[];
  resolution?: Resolution;
  status: "open" | "resolved" | "drifted";
  input: ClaimInput;
}

export interface Turn {
  role: "agent" | "engineer" | "auditor" | "tool";
  text: string;
  at: string;
}

export interface CallRecord {
  id: string;
  kind: "interview" | "auditor" | "replay";
  status: string;
  personId: string;
  to?: string;
  reason: string;
  startedAt: string;
  updatedAt: string;
  turns: Turn[];
  transcript?: string;
  recordingUrl?: string;
  durationSec?: number;
  claimIds: string[];
  packetId?: string;
}

export interface Callback {
  id: string;
  claimId: string;
  personId: string;
  reason: string;
  at: string;
  status: "pending" | "called";
}

export interface LogEvent {
  seq: number;
  at: string;
  type: string;
  summary: string;
  ref?: string;
  prev: string;
  hash: string;
}

export interface Packet {
  packetId: string;
  format: "sworn.packet/v1";
  company: string;
  issuedAt: string;
  call: {
    id: string;
    kind: CallRecord["kind"];
    startedAt: string;
    durationSec?: number;
    recordingUrl?: string;
    transcriptSha256: string;
  };
  claims: Omit<Claim, "input" | "history">[];
  logHead: string;
}

export type Dialect = "engineer" | "auditor" | "buyer" | "board";

export type Framework = "soc2" | "iso27001" | "nist80053" | "pcidss" | "hipaa" | "fedramp20x";
