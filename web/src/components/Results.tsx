import { ArrowLeft, ArrowSquareOut, CheckCircle, FileText, Headset, PhoneIncoming, ShieldCheck, Wrench, XCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, callClaims, getRenders, type Claim, type LedgerState, type Renders } from "../lib/api";
import { cn } from "../lib/utils";
import { markOf, Seal, Stamp } from "./Seal";
import { SystemChip, SystemLogo, systemKey } from "./SystemLogo";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

export function Results({ state, callId, refresh, onHome, onAuditor, onCallback }: {
  state: LedgerState | null; callId: string | null; refresh: () => void; onHome: () => void; onAuditor: () => void; onCallback: (id: string) => void;
}) {
  const claims = callClaims(state, callId);
  const [sel, setSel] = useState<string | null>(null);
  const [pkgOpen, setPkgOpen] = useState(false);
  useEffect(() => {
    if (!sel && claims.length) setSel((claims.find((c) => c.verdict !== "verified") ?? claims[0]).id);
  }, [claims.length]);
  const claim = claims.find((c) => c.id === sel) ?? claims[0];
  const rec = state?.calls.find((c) => c.id === callId);
  const packet = rec?.packetId ? state?.packets.find((p) => p.packetId === rec.packetId) : undefined;

  const caught = claims.filter((c) => c.verdict !== "verified");
  const counts: Record<string, number> = {};
  claims.forEach((c) => new Set(c.checks.flatMap((k) => k.exceptions.filter((f) => f.severity !== "low").map((f) => f.subject))).forEach((s) => (counts[s] = (counts[s] ?? 0) + 1)));
  const root = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-4 px-6 md:px-10">
        <span className="font-display text-[28px]">Sworn</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onHome}><ArrowLeft size={15} /> Start over</Button>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 pb-24 md:px-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="pt-6">
          <h1 className="max-w-[18ch] font-display text-[clamp(40px,6vw,72px)] leading-[1.0]">
            {caught.length ? `It caught ${caught.length} of ${claims.length} before an auditor could.` : `All ${claims.length} claims held up.`}
          </h1>
          <p className="mt-5 max-w-[60ch] text-[18px] leading-relaxed text-ink-2">
            {root && root[1] > 1
              ? <>One forgotten account, <b className="font-medium text-ink">{root[0]}</b>, broke {root[1]} of the things you said. Here is everything Sworn checked, and what your auditor receives.</>
              : "Here is everything Sworn checked, and what your auditor receives."}
          </p>
        </motion.div>

        {claims.length === 0 && <p className="mt-12 text-ink-3">No claims were made on this call.</p>}

        {claim && (
          <div className="mt-12 grid gap-6 lg:grid-cols-[340px_1fr]">
            <div className="space-y-2">
              {claims.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  onClick={() => setSel(c.id)}
                  className={cn("w-full rounded-[18px] border p-4 text-left transition-[border-color,background-color] duration-200", c.id === claim.id ? "border-ink/70 bg-sheet" : "border-rule bg-transparent hover:bg-sheet/60")}
                >
                  <Seal mark={markOf(c)} />
                  <div className="mt-2 text-[16px] font-medium">{c.plain.topic}</div>
                  <div className="mt-0.5 line-clamp-2 text-[14px] text-ink-2">{c.plain.text}</div>
                </motion.button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.article key={claim.id + claim.verdict} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="grid gap-6 rounded-[24px] border border-rule bg-sheet p-7 xl:grid-cols-[1fr_340px]">
                <div>
                  <div className="flex items-center gap-4"><Stamp mark={markOf(claim)} /><span className="font-mono text-[12px] text-ink-3">{claim.id}</span></div>
                  <h2 className="mt-5 font-serif text-[30px] leading-[1.15]">{claim.normalized}</h2>
                  <div className="mt-5 flex gap-3 rounded-[16px] border border-rule bg-paper/60 p-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e9dfcd] font-serif text-ink-2">{claim.speaker.name[0]}</span>
                    <div>
                      <div className="text-[14px] font-medium">{claim.speaker.name}</div>
                      <p className="font-serif text-[17px] italic">"{claim.statement}"</p>
                    </div>
                  </div>
                  <h3 className="mt-7 text-[15px] font-medium">Checks</h3>
                  <ul className="mt-3 space-y-2.5">
                    {claim.checks.map((k) => {
                      const bad = k.exceptions.some((f) => f.severity !== "low");
                      return (
                        <li key={k.checkId}>
                          <div className="flex items-center gap-3 text-[15px]">
                            {bad ? <XCircle size={20} weight="fill" className="text-bad" /> : <CheckCircle size={20} weight="fill" className="text-ok" />}
                            <span>{k.source}: {k.passing} of {k.population} {k.populationLabel}</span>
                          </div>
                          {k.exceptions.map((f) => (
                            <p key={f.id} className={cn("ml-8 mt-1 text-[14px] leading-relaxed", f.severity === "low" ? "text-ink-3" : "text-ink-2")}>{f.detail}</p>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                  {claim.resolution && (
                    <p className="mt-6 rounded-[14px] bg-paper/70 p-4 text-[14.5px] text-ink-2">
                      <b className="font-medium text-ink">Noted for the auditor.</b> {claim.resolution.note}{claim.resolution.owner ? `. Owner: ${claim.resolution.owner}` : ""}{claim.resolution.due ? `, due ${claim.resolution.due}` : ""}.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-[15px] font-medium">Evidence</h3>
                  <div className="mt-3 space-y-2.5">
                    {claim.checks.map((k) => (
                      <div key={k.checkId} className="flex items-start gap-3 rounded-[16px] border border-rule bg-paper/50 p-3.5">
                        <SystemChip k={systemKey(k.system)} size={38} />
                        <div className="min-w-0">
                          <div className="text-[14.5px] font-medium">{k.system}</div>
                          <div className="truncate font-mono text-[11px] text-ink-3">{k.evidenceRefs[0]}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-ink-3">sha256 {k.snapshotSha256.slice(0, 12)}…</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>
        )}

        {claims.length > 0 && (
          <Package claims={claims} packet={packet} onOpen={() => setPkgOpen(true)} quarter={state?.quarter ?? ""} />
        )}
        {claims.length > 0 && <Watching state={state} refresh={refresh} onCallback={onCallback} />}

        <div className="mt-16 flex flex-wrap gap-3 border-t border-rule pt-10">
          <Button variant="outline" size="lg" onClick={onAuditor}><Headset size={19} /> Now call in as the auditor</Button>
          <Button variant="ghost" size="lg" onClick={onHome}>Start over</Button>
        </div>
      </main>
      {claim && <PackageDialog open={pkgOpen} onOpenChange={setPkgOpen} claims={claims} version={state?.version ?? 0} packetId={packet?.packetId} />}
    </div>
  );
}

function Package({ claims, packet, onOpen, quarter }: { claims: Claim[]; packet?: { packetId: string; sha256: string }; onOpen: () => void; quarter: string }) {
  const n = (m: string) => claims.filter((c) => markOf(c) === m || (m === "partial" && c.verdict === "unverifiable")).length;
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative mt-16 grid items-center gap-10 overflow-hidden rounded-[28px] bg-[#ece2d1] p-8 md:p-12 lg:grid-cols-[1fr_1.1fr]"
    >
      <div>
        <h2 className="font-display text-[clamp(34px,4.5vw,54px)] leading-[1.02]">From a conversation to an audit package.</h2>
        <p className="mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-ink-2">Every claim, its checks, the recording's fingerprint and each framework's wording, sealed together so nobody can quietly edit it.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={onOpen}><FileText size={18} /> Open the package</Button>
          {packet && <Button variant="outline" asChild><a href={`/verify.html?packet=${packet.packetId}`} target="_blank" rel="noopener"><ShieldCheck size={18} /> Verify the signature <ArrowSquareOut size={14} /></a></Button>}
        </div>
        <p className="mt-4 font-mono text-[11.5px] text-ink-3">{packet ? `${packet.packetId} · sha256 ${packet.sha256.slice(0, 20)}…` : "Sealing the call record…"}</p>
      </div>
      <div className="relative h-[330px]">
        {[2, 1, 0].map((i) => (
          <motion.div
            key={i}
            initial={{ rotate: 0, x: 0, y: 30, opacity: 0 }}
            whileInView={{ rotate: i === 0 ? -2 : i === 1 ? 6 : -9, x: i === 0 ? 0 : i === 1 ? 70 : -60, y: i * 8, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.2 + (2 - i) * 0.12 }}
            className="absolute left-1/2 top-2 h-[300px] w-[250px] -translate-x-1/2 rounded-[14px] border border-rule bg-sheet p-5 shadow-[0_30px_60px_-30px_rgba(29,25,19,.5)]"
          >
            {i === 0 ? (
              <>
                <div className="font-display text-[16px]">Sworn</div>
                <div className="mt-4 font-serif text-[21px] leading-tight">SOC 2 Evidence Package</div>
                <div className="text-[13px] text-ink-3">{quarter}</div>
                <div className="mt-6 space-y-2.5 text-[14px]">
                  <div className="flex justify-between"><span className="text-ink-2">Verified</span><span className="font-mono">{n("verified")}</span></div>
                  <div className="flex justify-between"><span className="text-ink-2">Partly true</span><span className="font-mono">{n("partial")}</span></div>
                  <div className="flex justify-between"><span className="text-ink-2">Not true</span><span className="font-mono">{n("contradicted") + n("drifted")}</span></div>
                </div>
                <div className="absolute bottom-5 right-5"><Stamp mark="verified" delay={0.9} /></div>
              </>
            ) : (
              <div className="space-y-2.5 pt-10">
                {Array.from({ length: 7 }).map((_, j) => <div key={j} className="h-2 rounded-full bg-rule" style={{ width: `${88 - ((j * 13) % 40)}%` }} />)}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

function PackageDialog({ open, onOpenChange, claims, version, packetId }: { open: boolean; onOpenChange: (o: boolean) => void; claims: Claim[]; version: number; packetId?: string }) {
  const [fw, setFw] = useState("soc2");
  const [texts, setTexts] = useState<Record<string, Renders>>({});
  useEffect(() => {
    if (!open) return;
    Promise.all(claims.map((c) => getRenders(c.id, version).then((r) => [c.id, r] as const))).then((rs) => setTexts(Object.fromEntries(rs))).catch(() => {});
  }, [open, version]);
  const FW = [["soc2", "SOC 2"], ["iso27001", "ISO 27001"], ["nist80053", "NIST 800-53"], ["pcidss", "PCI DSS"], ["hipaa", "HIPAA"], ["fedramp20x", "FedRAMP 20x"]];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86dvh] w-[min(94vw,880px)] overflow-y-auto p-7">
        <DialogTitle className="font-display text-[32px]">Audit package{packetId ? ` ${packetId}` : ""}</DialogTitle>
        <Tabs value={fw} onValueChange={setFw} className="mt-4"><TabsList>{FW.map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList></Tabs>
        <div className="mt-5 space-y-6">
          {claims.map((c) => (
            <section key={c.id}>
              <div className="flex items-center gap-3"><Seal mark={markOf(c)} /><span className="font-mono text-[11px] text-ink-3">{c.id}</span></div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-[14.5px] leading-[1.7] text-ink">{texts[c.id]?.auditor[fw] ?? "…"}</pre>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Continuous: fix something and claims heal; break something and Sworn calls the owner back.
function Watching({ state, refresh, onCallback }: { state: LedgerState | null; refresh: () => void; onCallback: (id: string) => void }) {
  const [stage, setStage] = useState<"start" | "fixed" | "broken">("start");
  const [changed, setChanged] = useState<{ id: string; from: string; to: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async (name: string, next: "fixed" | "broken") => {
    setBusy(true);
    const r = await api<{ changed: { id: string; from: string; to: string }[] }>("/api/scenario", { name }).catch(() => ({ changed: [] }));
    setChanged(r.changed);
    setStage(next);
    refresh();
    setBusy(false);
  };
  const cb = state?.callbacks.at(-1);
  const cbClaim = cb && state?.claims.find((c) => c.id === cb.claimId);
  return (
    <section className="mt-16 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <h2 className="font-display text-[clamp(32px,4vw,48px)] leading-[1.04]">Then it keeps watching.</h2>
        <p className="mt-4 max-w-[44ch] text-[16.5px] leading-relaxed text-ink-2">An audit is a snapshot. Sworn re-checks every claim whenever the systems change, and calls the person who said it if it stops being true.</p>
        <div className="mt-7">
          {stage === "start" && <Button disabled={busy} onClick={() => run("contractor_removed", "fixed")}><Wrench size={18} /> Priya makes her fix</Button>}
          {stage === "fixed" && <Button disabled={busy} onClick={() => run("new_admin_without_mfa", "broken")}><XCircle size={18} /> Someone adds an admin without MFA</Button>}
        </div>
      </div>
      <div className="space-y-3">
        <AnimatePresence>
          {stage !== "start" && changed.map((c, i) => {
            const claim = state?.claims.find((x) => x.id === c.id);
            if (!claim) return null;
            return (
              <motion.div key={stage + c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} className="flex items-center justify-between gap-4 rounded-[18px] border border-rule bg-sheet p-4">
                <div>
                  <div className="font-mono text-[11px] text-ink-3">{c.id} · re-checked</div>
                  <div className="mt-1 text-[15.5px]">{claim.plain.text}</div>
                </div>
                <Stamp mark={markOf(claim)} delay={0.2 + i * 0.15} />
              </motion.div>
            );
          })}
          {stage === "broken" && cb && cbClaim && (
            <motion.div key="cb" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-[18px] border border-drift/30 bg-[#f1ecf8] p-5">
              <div className="flex items-center gap-3 text-drift"><PhoneIncoming size={22} weight="duotone" /><span className="font-medium">Sworn is calling Priya back</span></div>
              <p className="mt-2 text-[15px] text-ink-2">Something she said is no longer true: {cbClaim.plain.text} Nobody had to notice.</p>
              <Button className="mt-4" onClick={() => onCallback(cb.id)}><PhoneIncoming size={18} /> Take the callback as Priya</Button>
            </motion.div>
          )}
          {stage === "fixed" && changed.length === 0 && <p className="text-ink-3">Nothing depended on that change.</p>}
        </AnimatePresence>
        {stage === "start" && (
          <div className="grid grid-cols-4 gap-3 opacity-80">
            {["okta", "aws", "linear", "github"].map((k) => <div key={k} className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-rule p-4"><SystemLogo k={k} size={22} /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-ink-3">watching</span></div>)}
          </div>
        )}
      </div>
    </section>
  );
}
