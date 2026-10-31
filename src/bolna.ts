// Thin client for the hosted Bolna API (https://api.bolna.ai).

export class BolnaError extends Error {
  constructor(public status: number, public body: string) {
    super(`Bolna ${status}: ${body.slice(0, 300)}`);
  }
}

export async function bolna<T = any>(apiKey: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`https://api.bolna.ai${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new BolnaError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export interface CallResponse {
  message?: string;
  status?: string;
  execution_id: string;
}

export function placeCall(apiKey: string, agentId: string, phone: string, userData: Record<string, string>) {
  return bolna<CallResponse>(apiKey, "/call", {
    body: { agent_id: agentId, recipient_phone_number: phone, user_data: userData, bypass_call_guardrails: true },
  });
}

export function mintWebCallSession(apiKey: string, agentId: string, userData: Record<string, string>) {
  return fetch("https://api.bolna.ai/web-call/freeswitch-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, user_data: userData }),
  });
}
