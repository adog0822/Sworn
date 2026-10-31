import { useState } from "react";
import { api, type LedgerState } from "../lib/api";
import { markOf, Seal } from "./Seal";
import { SystemLogo, systemKey } from "./SystemLogo";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

// Everything technical, one click away and never in the first-run path.
export function Hood({ open, onOpenChange, state, refresh }: { open: boolean; onOpenChange: (o: boolean) => void; state: LedgerState | null; refresh: () => void }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const claims = (state?.claims ?? []).filter((c) => filter === "all" || markOf(c) === filter);
  const count = (m: string) => state?.claims.filter((c) => markOf(c) === m).length ?? 0;
  const ask = async () => {
    if (!q.trim()) return;
    const r = await api<{ answer: string }>("/api/ask", { question: q, framework: "soc2" }).catch((e) => ({ answer: e.message }));
    setAnswer(r.answer);
  };
  const scenario = async (name: string) => {
    const r = await api<{ reason: string; changed: unknown[] }>("/api/scenario", { name }).catch((e) => ({ reason: e.message, changed: [] }));
    setNote(`${r.reason}. ${r.changed.length} claim(s) re-checked.`);
    refresh();
  };
  const callPhone = async () => {
    const r = await api<{ executionId: string }>("/api/calls", { kind: "interview", phone, passcode: code }).then(() => "Calling your phone now.").catch((e) => e.message);
    setNote(r);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] w-[min(96vw,1040px)] overflow-y-auto p-7">
        <DialogTitle className="font-display text-[34px]">Under the hood</DialogTitle>
        <DialogDescription className="mt-1 text-[15px] text-ink-2">Every statement your team makes, verified against real systems. Quillfeather is a sample company.</DialogDescription>
        <Tabs defaultValue="ledger" className="mt-5">
          <TabsList>
            <TabsTrigger value="ledger">Claims ledger</TabsTrigger>
            <TabsTrigger value="ask">Auditor line</TabsTrigger>
            <TabsTrigger value="systems">Systems</TabsTrigger>
            <TabsTrigger value="agents">For agents</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="pt-5">
            <div className="flex flex-wrap gap-2 text-[13px]">
              {[["all", "All", state?.claims.length ?? 0], ["verified", "Verified", count("verified")], ["partial", "Partly true", count("partial")], ["contradicted", "Not true", count("contradicted")], ["drifted", "Drifted", count("drifted")]].map(([k, l, n]) => (
                <button key={k as string} onClick={() => setFilter(k as string)} className={`rounded-full border px-3 py-1.5 ${filter === k ? "border-ink bg-sheet text-ink" : "border-rule text-ink-3"}`}>{l} <span className="font-mono text-[11px]">{n}</span></button>
              ))}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead className="text-[12px] text-ink-3"><tr><th className="py-2 font-normal">Status</th><th className="font-normal">ID</th><th className="font-normal">Claim</th><th className="font-normal">Checked in</th><th className="font-normal">Owner</th></tr></thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={c.id} className="border-t border-rule align-top">
                      <td className="py-3 pr-3"><Seal mark={markOf(c)} /></td>
                      <td className="pr-3 pt-3 font-mono text-[12px]">{c.id}</td>
                      <td className="max-w-[360px] pr-3 pt-3">{c.normalized}</td>
                      <td className="pr-3 pt-3"><span className="flex gap-2">{[...new Set(c.checks.map((k) => systemKey(k.system)))].map((k) => <SystemLogo key={k} k={k} size={16} />)}</span></td>
                      <td className="pt-3 text-ink-2">{c.speaker.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="ask" className="pt-5">
            <label htmlFor="ask" className="text-[13px] text-ink-2">Ask what an auditor would ask</label>
            <div className="mt-2 flex gap-2">
              <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="How fast is access revoked when someone leaves?" className="h-11 flex-1 rounded-full border border-rule bg-sheet px-4 text-[15px] placeholder:text-ink-3" />
              <Button onClick={ask}>Ask</Button>
            </div>
            {answer && <p className="mt-4 rounded-[16px] bg-paper p-4 text-[15px] leading-relaxed">{answer}</p>}
          </TabsContent>

          <TabsContent value="systems" className="pt-5">
            {state && (
              <div className="grid gap-3 sm:grid-cols-4">
                {[["aws", state.systems.awsIamUsers, `IAM users, ${state.systems.awsIamWithoutMfa.length} without MFA`], ["okta", state.systems.oktaActive, "active Okta users"], ["github", state.systems.prodRepos, "production repos"], ["aws", state.systems.dataStores, "encrypted data stores"]].map(([k, n, l], i) => (
                  <div key={i} className="rounded-[16px] border border-rule bg-sheet p-4"><SystemLogo k={k as string} size={18} /><div className="mt-3 font-serif text-[28px]">{n}</div><div className="text-[13px] text-ink-2">{l}</div></div>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => scenario("contractor_removed")}>Delete jsmith-contractor</Button>
              <Button variant="outline" size="sm" onClick={() => scenario("new_admin_without_mfa")}>Add an admin without MFA</Button>
              <Button variant="outline" size="sm" onClick={() => scenario("admin_bypass_closed")}>Close the Terraform admin bypass</Button>
              <Button variant="ghost" size="sm" onClick={async () => { await api("/api/reset", {}); setNote("Demo reset. Signed packets are kept."); refresh(); }}>Reset demo</Button>
            </div>
          </TabsContent>

          <TabsContent value="agents" className="space-y-4 pt-5 text-[15px] text-ink-2">
            <p>Buyers' procurement agents can question the same verified ledger over MCP and get the same bounded answers a person gets on the phone.</p>
            <code className="block rounded-[12px] bg-night px-4 py-3 font-mono text-[12.5px] text-cream">POST {location.origin}/mcp · tools: list_claims, ask_compliance, get_packet</code>
            <p>Signed packets verify against the public key at <a className="underline" href="/.well-known/sworn-keys.json">/.well-known/sworn-keys.json</a>, or in the browser at <a className="underline" href="/verify.html">/verify.html</a>.</p>
            <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-rule">
              {state?.log.slice(0, 14).map((e) => (
                <div key={e.seq} className="grid grid-cols-[80px_1fr] gap-3 border-b border-rule px-3 py-2 text-[13px] last:border-0"><span className="font-mono text-[11px] text-ink-3">{e.hash.slice(0, 8)}</span><span>{e.summary}</span></div>
              ))}
            </div>
            <div>
              <div className="text-[13px] text-ink-2">Have Sworn call a phone (verified numbers, demo passcode)</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input aria-label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+16175551234" className="h-11 rounded-full border border-rule bg-sheet px-4" />
                <input aria-label="Demo passcode" type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" className="h-11 rounded-full border border-rule bg-sheet px-4" />
                <Button onClick={callPhone}>Call me</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        {note && <p className="mt-4 text-[14px] text-ember">{note}</p>}
      </DialogContent>
    </Dialog>
  );
}
