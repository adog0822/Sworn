import { useEffect, useRef, useState } from "react";

export type Verdict = "verified" | "partial" | "contradicted" | "unverifiable";

export interface Finding { id: string; system: string; subject: string; detail: string; severity: "high" | "medium" | "low"; evidenceRef: string }
export interface Check { checkId: string; system: string; source: string; observedAt: string; population: number; passing: number; populationLabel: string; exceptions: Finding[]; evidenceRefs: string[]; snapshotSha256: string }
export interface Claim {
  id: string; kind: string; statement: string; normalized: string; verdict: Verdict; status: "open" | "resolved" | "drifted";
  speaker: { id: string; name: string; role: string }; channel: string; callId?: string; assertedAt: string;
  checks: Check[]; resolution?: { kind: string; note: string; owner?: string; due?: string };
  plain: { topic: string; stamp: string; text: string };
}
export interface Turn { role: "agent" | "engineer" | "auditor" | "tool"; text: string; at: string }
export interface Call { id: string; kind: "interview" | "auditor" | "replay"; status: string; personId: string; reason: string; startedAt: string; turns: Turn[]; claimIds: string[]; packetId?: string; durationSec?: number; recordingUrl?: string }
export interface Packet { packetId: string; issuedAt: string; sha256: string; claims: number; callId: string }
export interface Callback { id: string; claimId: string; personId: string; reason: string }
export interface LedgerState {
  version: number; company: string; quarter: string; asOf: string; keyId: string;
  systems: { awsIamUsers: number; awsIamWithoutMfa: string[]; oktaActive: number; oktaDeprovisioned: string[]; prodRepos: number; dataStores: number };
  claims: Claim[]; calls: Call[]; packets: Packet[]; callbacks: Callback[];
  log: { seq: number; at: string; type: string; summary: string; hash: string }[];
}
export type Renders = { engineer: string; buyer: string; board: string; auditor: Record<string, string> };

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

// Polls a cheap version number and refetches the ledger only when it changes.
export function useLedger(fast: boolean) {
  const [state, setState] = useState<LedgerState | null>(null);
  const version = useRef(-1);
  const fastRef = useRef(fast);
  fastRef.current = fast;
  const refresh = async (force = false) => {
    try {
      const { version: v } = await api<{ version: number }>("/api/version");
      if (!force && v === version.current) return;
      const s = await api<LedgerState>("/api/state");
      version.current = s.version;
      setState(s);
    } catch {
      /* transient network errors are retried on the next tick */
    }
  };
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (alive) t = setTimeout(loop, fastRef.current ? 600 : 2500);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return { state, refresh: () => refresh(true) };
}

export const renderCache = new Map<string, Renders>();
export async function getRenders(id: string, version: number) {
  const key = `${id}@${version}`;
  if (!renderCache.has(key)) renderCache.set(key, await api<Renders>(`/api/claims/${id}/renders`));
  return renderCache.get(key)!;
}

export const callClaims = (s: LedgerState | null, callId: string | null) => {
  const call = s?.calls.find((c) => c.id === callId);
  if (!s || !call) return [];
  return s.claims.filter((c) => call.claimIds.includes(c.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
};
