import { CheckCircle, CircleNotch, Microphone, MicrophoneSlash, PhoneDisconnect, Scroll, SealCheck, XCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { callClaims, type Claim, type LedgerState } from "../lib/api";
import type { useCall } from "../lib/useCall";
import { cn } from "../lib/utils";
import { SCRIPTS } from "./Onboarding";
import { Orb } from "./Orb";
import { markOf, Stamp } from "./Seal";
import { SystemLogo, systemKey } from "./SystemLogo";
import { Button } from "./ui/button";

type CallApi = ReturnType<typeof useCall>;

export function CallScreen({ call, state }: { call: CallApi; state: LedgerState | null }) {
  const [showScript, setShowScript] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const rec = state?.calls.find((c) => c.id === call.callId);
  const claims = callClaims(state, call.callId);
  const cited = useMemo(() => {
    if (call.role !== "auditor" || !rec) return [] as Claim[];
    const ids = [...new Set(rec.turns.filter((t) => t.role === "tool").flatMap((t) => t.text.match(/SW-\d+/g) ?? []))];
    return ids.map((id) => state!.claims.find((c) => c.id === id)).filter(Boolean) as Claim[];
  }, [rec, call.role, state]);

  const secs = call.phase === "live" ? Math.max(0, Math.floor((now - call.startedAt) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  const open = claims.filter((c) => c.verdict !== "verified" && c.status !== "resolved");
  const scriptIndex = call.role === "auditor" ? Math.min(cited.length, 2) : Math.min(claims.length, 2);
  const cue: { hint?: string; line: string } =
    call.role === "interview" && open.length ? { hint: "Sworn found a problem. Explain it, or promise a fix.", line: "That's an old contractor account. I'll delete it today." }
      : call.role === "interview" && claims.length >= 3 ? { hint: "You're done. Wrap up.", line: "Thanks. What does the auditor get?" }
        : { line: SCRIPTS[call.role][scriptIndex] };

  const lastTurn = rec?.turns.filter((t) => t.role !== "tool").at(-1);
  const status =
    call.phase === "connecting" ? "Connecting…"
      : call.phase === "ended" ? "Call ended. Sealing the record…"
        : call.mode === "replay" ? (lastTurn?.role === "agent" ? "Sworn is speaking" : "Priya is speaking")
          : call.speaking ? "Sworn is speaking" : "Listening";

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-night text-cream">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_28%_45%,rgba(176,99,26,.22),transparent_55%)]" aria-hidden />
      <header className="relative mx-auto flex h-[72px] max-w-[1400px] items-center gap-6 px-6 md:px-10">
        <span className="font-display text-[26px]">Sworn</span>
        <ol className="mx-auto hidden items-center gap-1 text-[14px] text-cream-2 md:flex">
          {["Talk", "Check", "Translate", "Seal"].map((s, i) => (
            <li key={s} className={cn("rounded-full px-3 py-1.5", (i === 0 || (i === 1 && claims.length + cited.length > 0)) && "bg-white/[.07] text-cream")}>{s}</li>
          ))}
        </ol>
        <span className="ml-auto font-mono text-[12px] text-cream-2 md:ml-0">{call.mode === "replay" ? "Sample call" : "Live on Bolna"}</span>
      </header>

      <div className="relative mx-auto grid max-w-[1400px] gap-8 px-6 pb-10 md:px-10 lg:grid-cols-[1fr_440px]">
        <section className="flex flex-col items-center pt-2">
          <div className="relative grid place-items-center">
            <Orb level={call.level} size={380} />
            <div className="absolute grid size-[104px] place-items-center rounded-full border border-white/10 bg-[#2a231b]/90 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
              {call.role === "auditor" ? <SealCheck size={40} weight="duotone" className="text-ember-2" /> : <span className="font-display text-[40px] text-cream">S</span>}
            </div>
          </div>
          <h1 className="mt-2 font-serif text-[30px]">On a call with Sworn</h1>
          <p className="mt-1 text-[15px] text-cream-2">
            {call.role === "auditor" ? "You're the auditor" : "You're Priya, platform lead"} · <span className="font-mono text-[13px]">{clock}</span>
          </p>
          <p className="mt-2 h-6 text-[14px] text-ember-2" aria-live="polite">{status}</p>

          <div className="mt-5 flex items-center gap-6">
            {call.mode === "live" && (
              <ControlButton label={call.muted ? "Unmute" : "Mute"} onClick={call.toggleMute}>
                {call.muted ? <MicrophoneSlash size={22} /> : <Microphone size={22} />}
              </ControlButton>
            )}
            <div className="flex flex-col items-center gap-2">
              <Button variant="danger" size="icon" onClick={call.end} aria-label="End call"><PhoneDisconnect size={24} weight="fill" /></Button>
              <span className="text-[13px] text-[#f0a48c]">End call</span>
            </div>
            <ControlButton label="Script" onClick={() => setShowScript(!showScript)} active={showScript}>
              <Scroll size={22} />
            </ControlButton>
          </div>

          <AnimatePresence>
            {showScript && call.mode === "live" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mt-8 w-full max-w-[560px] rounded-[20px] border border-white/10 bg-white/[.04] px-6 py-5 text-center">
                <div className="text-[14px] text-cream-2">Say next</div>
                <AnimatePresence mode="wait">
                  <motion.p key={cue.line} initial={{ opacity: 0, y: 8, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="mt-2 font-serif text-[22px] leading-snug">
                    "{cue.line}"
                  </motion.p>
                </AnimatePresence>
                {cue.hint && <p className="mt-2 text-[13px] text-ember-2">{cue.hint}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <Feed call={call} claims={claims} cited={cited} rec={rec} />
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="glass" size="icon" onClick={onClick} aria-label={label} className={cn(active && "border-ember/50 text-ember-2")}>{children}</Button>
      <span className="text-[13px] text-cream-2">{label}</span>
    </div>
  );
}

type FeedItem = { key: string; at: number; node: React.ReactNode };

function Feed({ call, claims, cited, rec }: { call: CallApi; claims: Claim[]; cited: Claim[]; rec?: { turns: { role: string; text: string; at: string }[] } }) {
  const box = useRef<HTMLDivElement>(null);
  const items: FeedItem[] = [];
  const t0 = call.startedAt;
  if (call.mode === "live" && call.role === "interview") {
    items.push({ key: "hello", at: t0, node: <Line who="Sworn" text="Hello Priya, Sworn here. It's about the Q4 access review. Tell me what you did, and I'll check whether the systems agree." /> });
  }
  if (call.mode === "replay") {
    rec?.turns.filter((t) => t.role !== "tool").forEach((t, i) => items.push({ key: `t${i}`, at: Date.parse(t.at) + i, node: <Line who={t.role === "agent" ? "Sworn" : "Priya"} text={t.text} /> }));
  } else {
    call.captions.forEach((c) => items.push({ key: `c${c.id}`, at: c.at, node: <Line who="You" text={c.text} interim={!c.final} /> }));
  }
  claims.forEach((c) => items.push({ key: c.id, at: Date.parse(c.assertedAt) + 1, node: <ClaimBlock claim={c} /> }));
  cited.forEach((c, i) => items.push({ key: `cite-${c.id}`, at: Date.now() - 1000 + i, node: <Cited claim={c} /> }));
  items.sort((a, b) => a.at - b.at);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [items.length, claims.map((c) => c.status).join()]);

  return (
    <aside className="flex h-[min(78dvh,760px)] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-night-2/80 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-night-rule px-5 py-4">
        <span className="text-[15px] font-medium">Live transcript</span>
      </div>
      <div ref={box} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {items.length === 0 && <p className="text-[14px] text-cream-2">Waiting for the conversation…</p>}
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.div key={it.key} layout="position" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
              {it.node}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 border-t border-night-rule px-5 py-3.5 text-[13px] text-cream-2">
        <span className="flex h-4 items-center gap-[2px]" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <motion.span key={i} className="h-4 w-[2px] origin-center rounded-full bg-ember-2" animate={{ scaleY: [0.3, 0.6 + (i % 3) * 0.2, 0.3] }} transition={{ duration: 0.8 + i * 0.07, repeat: Infinity }} />
          ))}
        </span>
        {call.phase === "ended" ? "Call ended" : "Listening…"}
      </div>
    </aside>
  );
}

function Line({ who, text, interim }: { who: string; text: string; interim?: boolean }) {
  const sworn = who === "Sworn";
  return (
    <div className="flex gap-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[13px]", sworn ? "bg-ember/80 text-white" : "bg-white/10 text-cream")}>{who[0]}</span>
      <div>
        <div className="text-[13px] font-medium text-cream">{who}</div>
        <p className={cn("text-[15px] leading-relaxed", sworn ? "text-cream" : "text-cream-2", interim && "opacity-60")}>{text}</p>
      </div>
    </div>
  );
}

// A spoken claim, checked one system at a time. Results are real; the reveal is paced so you can follow it.
function ClaimBlock({ claim }: { claim: Claim }) {
  const [shown, setShown] = useState(0);
  const total = claim.checks.length;
  useEffect(() => {
    if (shown > total) return;
    const t = setTimeout(() => setShown(shown + 1), shown === 0 ? 250 : 650);
    return () => clearTimeout(t);
  }, [shown, total]);
  return (
    <div className="ml-11 rounded-[16px] border border-white/10 bg-white/[.03] p-4">
      <div className="text-[14px] font-medium text-cream">{claim.plain.topic} <span className="font-mono text-[11px] text-cream-2">{claim.id}</span></div>
      <div className="mt-3 space-y-2">
        {claim.checks.map((k, i) => {
          const done = shown > i + 1;
          const bad = k.exceptions.some((f) => f.severity !== "low");
          if (shown < i + 1) return null;
          return (
            <motion.div key={k.checkId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 rounded-[10px] bg-[#f6efe3] px-3 py-2 text-[13.5px] text-ink">
              <SystemLogo k={systemKey(k.system)} size={16} />
              <span className="truncate">{done ? `${k.passing} of ${k.population} ${k.populationLabel}` : `Checking ${k.system}…`}</span>
              <span className="ml-auto">{!done ? <CircleNotch size={16} className="animate-spin text-ember" /> : bad ? <XCircle size={17} weight="fill" className="text-bad" /> : <CheckCircle size={17} weight="fill" className="text-ok" />}</span>
            </motion.div>
          );
        })}
      </div>
      {shown > total && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
          <Stamp mark={markOf(claim)} dark />
          <p className="mt-2 text-[15px] leading-relaxed text-cream">{claim.plain.text}</p>
          {claim.resolution && <p className="mt-1.5 text-[13.5px] text-cream-2">Noted for the auditor: {claim.resolution.note}{claim.resolution.due ? ` (due ${claim.resolution.due})` : ""}.</p>}
        </motion.div>
      )}
    </div>
  );
}

function Cited({ claim }: { claim: Claim }) {
  return (
    <div className="ml-11 rounded-[16px] border border-white/10 bg-white/[.03] p-4">
      <div className="text-[14px] text-cream-2">Answered from <span className="font-mono text-[12px]">{claim.id}</span></div>
      <p className="mt-2 text-[15px] text-cream">{claim.plain.text}</p>
      <p className="mt-1 text-[13px] text-cream-2">Sworn only answers auditors from records it has checked.</p>
    </div>
  );
}
