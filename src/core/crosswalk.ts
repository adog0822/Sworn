import type { ClaimKind, Framework } from "./types";

// One claim, many dialects. Each framework names the same obligation differently;
// the crosswalk is how a single verified claim answers all of them.

export interface ControlRef {
  id: string;
  title: string;
}

export const FRAMEWORKS: Record<Framework, { name: string; unit: string; exceptionWord: string; passWord: string }> = {
  soc2: { name: "SOC 2 (2017 TSC)", unit: "criterion", exceptionWord: "Exception noted", passWord: "No exceptions noted" },
  iso27001: { name: "ISO/IEC 27001:2022", unit: "Annex A control", exceptionWord: "Nonconformity", passWord: "Conforming" },
  nist80053: { name: "NIST SP 800-53 Rev. 5", unit: "control", exceptionWord: "Other than satisfied", passWord: "Satisfied" },
  pcidss: { name: "PCI DSS v4.0.1", unit: "requirement", exceptionWord: "Not in place", passWord: "In place" },
  hipaa: { name: "HIPAA Security Rule", unit: "standard", exceptionWord: "Gap identified", passWord: "Implemented" },
  fedramp20x: { name: "FedRAMP 20x", unit: "Key Security Indicator theme", exceptionWord: "Indicator not met", passWord: "Indicator met" },
};

export const CROSSWALK: Record<ClaimKind, Record<Framework, ControlRef[]>> = {
  "mfa.enforced": {
    soc2: [{ id: "CC6.1", title: "Logical access security software, infrastructure and architectures" }],
    iso27001: [{ id: "A.8.5", title: "Secure authentication" }, { id: "A.5.17", title: "Authentication information" }],
    nist80053: [{ id: "IA-2(1)", title: "MFA to privileged accounts" }, { id: "IA-2(2)", title: "MFA to non-privileged accounts" }],
    pcidss: [{ id: "8.4.2", title: "MFA for all non-console access into the CDE" }],
    hipaa: [{ id: "164.312(d)", title: "Person or entity authentication" }],
    fedramp20x: [{ id: "KSI-IAM", title: "Identity and Access Management: phishing-resistant MFA" }],
  },
  "access_review.completed": {
    soc2: [{ id: "CC6.2", title: "User registration, authorization and removal" }, { id: "CC6.3", title: "Role-based access, modification and removal" }],
    iso27001: [{ id: "A.5.18", title: "Access rights" }],
    nist80053: [{ id: "AC-2", title: "Account management (periodic account review)" }],
    pcidss: [{ id: "7.2.4", title: "User accounts and access privileges reviewed at least every six months" }],
    hipaa: [{ id: "164.308(a)(4)", title: "Information access management" }],
    fedramp20x: [{ id: "KSI-IAM", title: "Identity and Access Management: least privilege" }],
  },
  "accounts.deprovisioned": {
    soc2: [{ id: "CC6.2", title: "User registration, authorization and removal" }],
    iso27001: [{ id: "A.5.18", title: "Access rights" }, { id: "A.6.5", title: "Responsibilities after termination or change of employment" }],
    nist80053: [{ id: "AC-2(3)", title: "Disable accounts" }, { id: "PS-4", title: "Personnel termination" }],
    pcidss: [{ id: "8.2.5", title: "Access for terminated users is immediately revoked" }],
    hipaa: [{ id: "164.308(a)(3)(ii)(C)", title: "Termination procedures" }],
    fedramp20x: [{ id: "KSI-IAM", title: "Identity and Access Management: account lifecycle" }],
  },
  "change.peer_review": {
    soc2: [{ id: "CC8.1", title: "Change management: authorize, design, test, approve and implement changes" }],
    iso27001: [{ id: "A.8.32", title: "Change management" }],
    nist80053: [{ id: "CM-3", title: "Configuration change control" }],
    pcidss: [{ id: "6.5.1", title: "Changes follow established change control procedures" }],
    hipaa: [{ id: "164.308(a)(1)(ii)(B)", title: "Risk management (HIPAA has no dedicated change-control standard)" }],
    fedramp20x: [{ id: "KSI-CMT", title: "Change Management" }],
  },
  "encryption.at_rest": {
    soc2: [{ id: "CC6.1", title: "Logical access security, including encryption of data at rest" }],
    iso27001: [{ id: "A.8.24", title: "Use of cryptography" }],
    nist80053: [{ id: "SC-28", title: "Protection of information at rest" }],
    pcidss: [{ id: "3.5.1", title: "PAN is rendered unreadable anywhere it is stored" }],
    hipaa: [{ id: "164.312(a)(2)(iv)", title: "Encryption and decryption" }],
    fedramp20x: [{ id: "KSI-SVC", title: "Service Configuration: encryption" }],
  },
};

export function controlsFor(kind: ClaimKind, framework: Framework): ControlRef[] {
  return CROSSWALK[kind][framework];
}

export function controlLabel(kind: ClaimKind, framework: Framework): string {
  return controlsFor(kind, framework).map((c) => c.id).join(", ");
}
