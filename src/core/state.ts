import type { Person } from "./types";

// Quillfeather is fictional. Its systems are seeded relative to "now" so the
// demo reads the same whichever day it runs: the contractor was offboarded in
// Okta a week ago, and their AWS access key was still used three days ago.

export interface IamUser {
  name: string;
  human: boolean;
  consoleAccess: boolean;
  mfa: boolean;
  oktaLogin?: string;
  accessKeyLastUsed?: string;
  createdAt: string;
}

export interface OktaUser {
  login: string;
  name: string;
  status: "ACTIVE" | "DEPROVISIONED";
  mfaEnrolled: boolean;
  deactivatedAt?: string;
}

export interface Repo {
  name: string;
  prod: boolean;
  requiredApprovals: number;
  statusChecks: boolean;
  enforceAdmins: boolean;
  adminBypasses90d: number;
}

export interface Ticket {
  id: string;
  title: string;
  status: "Done" | "In Progress" | "Todo";
  approver?: string;
  approvedAt?: string;
}

export interface Datastore {
  id: string;
  kind: "rds" | "s3";
  encrypted: boolean;
  kms: string;
}

export interface SystemState {
  company: string;
  asOf: string;
  quarter: string;
  aws: { accountAlias: string; iamUsers: IamUser[]; datastores: Datastore[]; scps: string[] };
  okta: { mfaPolicy: { name: string; enforced: boolean; factor: string }; users: OktaUser[] };
  github: { org: string; repos: Repo[] };
  linear: { tickets: Ticket[] };
  people: Person[];
}

const DAY = 86_400_000;

export function quarterOf(d: Date): string {
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

export function seedState(now = new Date()): SystemState {
  const ago = (days: number, hour = 15) => {
    const d = new Date(now.getTime() - days * DAY);
    d.setUTCHours(hour, 12, 0, 0);
    return d.toISOString();
  };

  const engineers: [string, string][] = [
    ["priya.raman", "Priya Raman"], ["dev.shah", "Dev Shah"], ["raj.patel", "Raj Patel"],
    ["ana.lima", "Ana Lima"], ["tom.becker", "Tom Becker"], ["mei.chen", "Mei Chen"],
    ["omar.haddad", "Omar Haddad"], ["sara.nilsen", "Sara Nilsen"], ["li.wei", "Li Wei"],
    ["kofi.mensah", "Kofi Mensah"], ["ines.duarte", "Ines Duarte"],
  ];

  const iamUsers: IamUser[] = [
    ...engineers.map(([login]) => ({
      name: login, human: true, consoleAccess: true, mfa: true, oktaLogin: login,
      accessKeyLastUsed: ago(1), createdAt: ago(400),
    })),
    {
      name: "jsmith-contractor", human: true, consoleAccess: true, mfa: false,
      oktaLogin: "j.smith", accessKeyLastUsed: ago(3, 2), createdAt: ago(120),
    },
    { name: "svc-deploy", human: false, consoleAccess: false, mfa: false, accessKeyLastUsed: ago(0, 9), createdAt: ago(500) },
    { name: "svc-backup", human: false, consoleAccess: false, mfa: false, accessKeyLastUsed: ago(0, 4), createdAt: ago(500) },
  ];

  const oktaActive: OktaUser[] = engineers.map(([login, name]) => ({ login, name, status: "ACTIVE", mfaEnrolled: true }));
  // 30 more workforce identities outside engineering, all MFA-enrolled.
  for (let i = 1; i <= 30; i++) {
    oktaActive.push({ login: `staff${String(i).padStart(2, "0")}`, name: `Staff member ${i}`, status: "ACTIVE", mfaEnrolled: true });
  }

  return {
    company: "Quillfeather",
    asOf: now.toISOString(),
    quarter: quarterOf(now),
    aws: {
      accountAlias: "qf-prod",
      iamUsers,
      scps: ["DenyRootAccess", "RequireIMDSv2", "DenyLeavingOrg"],
      datastores: [
        { id: "rds/payments-db", kind: "rds", encrypted: true, kms: "alias/qf-data" },
        { id: "rds/ledger-db", kind: "rds", encrypted: true, kms: "alias/qf-data" },
        { id: "rds/analytics-db", kind: "rds", encrypted: true, kms: "alias/qf-data" },
        { id: "s3/qf-customer-exports", kind: "s3", encrypted: true, kms: "alias/qf-data" },
        { id: "s3/qf-audit-logs", kind: "s3", encrypted: true, kms: "alias/qf-logs" },
        { id: "s3/qf-backups", kind: "s3", encrypted: true, kms: "alias/qf-backup" },
      ],
    },
    okta: {
      mfaPolicy: { name: "Workforce - phishing-resistant", enforced: true, factor: "FIDO2 / Okta Verify" },
      users: [
        ...oktaActive,
        { login: "j.smith", name: "Jordan Smith (contractor)", status: "DEPROVISIONED", mfaEnrolled: true, deactivatedAt: ago(7, 17) },
        { login: "alex.kim", name: "Alex Kim", status: "DEPROVISIONED", mfaEnrolled: true, deactivatedAt: ago(7, 17) },
        { login: "m.osei", name: "Maya Osei", status: "DEPROVISIONED", mfaEnrolled: true, deactivatedAt: ago(7, 17) },
      ],
    },
    github: {
      org: "quillfeather",
      repos: [
        { name: "payments-api", prod: true, requiredApprovals: 1, statusChecks: true, enforceAdmins: true, adminBypasses90d: 0 },
        { name: "web-app", prod: true, requiredApprovals: 1, statusChecks: true, enforceAdmins: true, adminBypasses90d: 0 },
        { name: "ledger-service", prod: true, requiredApprovals: 2, statusChecks: true, enforceAdmins: true, adminBypasses90d: 0 },
        { name: "infra-terraform", prod: true, requiredApprovals: 1, statusChecks: true, enforceAdmins: false, adminBypasses90d: 1 },
      ],
    },
    linear: {
      tickets: [
        { id: "SEC-214", title: `${quarterOf(now)} user access review (Okta, AWS, GitHub)`, status: "Done", approver: "Raj Patel", approvedAt: ago(6, 16) },
        { id: "SEC-209", title: "Offboard j.smith, alex.kim, m.osei", status: "Done", approver: "Raj Patel", approvedAt: ago(7, 18) },
      ],
    },
    people: [
      { id: "priya", name: "Priya Raman", role: "Platform Lead, owner of identity and access controls", location: "Bengaluru" },
      { id: "dev", name: "Dev Shah", role: "Staff Engineer, owner of change management", location: "Boston" },
      { id: "raj", name: "Raj Patel", role: "Engineering Manager, access review approver", location: "Bengaluru" },
      { id: "auditor", name: "External auditor", role: "SOC 2 Type II auditor", location: "Boston" },
    ],
  };
}

export function personById(state: SystemState, id?: string): Person {
  return state.people.find((p) => p.id === id) ?? state.people[0];
}
