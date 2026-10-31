import { ArrowRight, Microphone, PlayCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { getRenders, type Claim, type LedgerState, type Renders } from "../lib/api";
import { ProofVignette } from "./ProofVignette";
import { Stamp } from "./Seal";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } as const;

export function Landing({ state, onTalk, onWatch, onHood }: { state: LedgerState | null; onTalk: () => void; onWatch: () => void; onHood: () => void }) {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-[72px] max-w-[1280px] items-center px-6 md:px-10">
        <span className="font-display text-[28px] leading-none">Sworn</span>
        <nav className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onWatch} className="hidden sm:inline-flex">Watch a call</Button>
          <Button variant="outline" size="sm" onClick={onHood}>Under the hood <ArrowRight size={15} /></Button>
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-6 pb-20 pt-10 md:px-10 lg:grid-cols-[1fr_600px] lg:pt-16">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
          <h1 className="font-display text-[clamp(44px,5.2vw,76px)] leading-[1.0]">
            Say it.<br />Sworn checks<br />if it's true.
          </h1>
          <p className="mt-7 max-w-[30ch] text-[19px] leading-relaxed text-ink-2">
            An AI that calls your engineers, hears how security works, and checks every answer against the real systems.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button size="lg" onClick={onTalk}><Microphone size={20} weight="fill" /> Talk to Sworn</Button>
            <Button size="lg" variant="outline" onClick={onWatch}><PlayCircle size={20} /> Watch a call</Button>
          </div>
        </motion.div>
        <ProofVignette />
      </section>

      <SixWeeks />
      <Translator state={state} />
      <SecondAfter />

      <section className="mx-auto max-w-[1280px] px-6 pb-28 pt-8 md:px-10">
        <motion.div {...rise} className="flex flex-col items-start gap-6 border-t border-rule pt-14 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-[16ch] font-display text-[clamp(36px,5vw,60px)] leading-[1.02]">Try to talk your way past it.</h2>
          <Button size="lg" onClick={onTalk}><Microphone size={20} weight="fill" /> Talk to Sworn</Button>
        </motion.div>
        <p className="mt-10 text-[13px] text-ink-3">Quillfeather and its people are fictional. The voice calls, checks and signatures are real. A LoxeAI project for the Bolna Symphony Buildathon.</p>
      </section>
    </div>
  );
}

/* Impact, shown: the same sentence handled today vs. with Sworn. */
function SixWeeks() {
  const reduce = useReducedMotion();
  const today = [
    { when: "Day 1", what: "\"MFA is on for everyone.\"", tone: "text-ink" },
    { when: "Week 6", what: "Auditor samples the IAM report", tone: "text-ink-2" },
    { when: "Week 7", what: "Exception written into your SOC 2 report", tone: "text-bad" },
    { when: "Week 9", what: "Enterprise deal waits on the fix", tone: "text-bad" },
  ];
  const sworn = [
    { when: "0:14", what: "\"MFA is on for everyone.\"", tone: "text-ink" },
    { when: "0:15", what: "Sworn: \"The IAM report disagrees.\"", tone: "text-ember" },
    { when: "Same day", what: "Fixed, re-checked, signed", tone: "text-ok" },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
      <motion.h2 {...rise} className="max-w-[18ch] font-display text-[clamp(36px,5vw,64px)] leading-[1.02]">
        The same sentence. Two very different outcomes.
      </motion.h2>
      <div className="mt-14 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <motion.div {...rise} className="rounded-[24px] border border-rule bg-sheet p-7">
          <div className="text-[15px] text-ink-3">How it goes today</div>
          <ol className="relative mt-6 space-y-6 border-l border-dashed border-rule pl-6">
            {today.map((s, i) => (
              <motion.li
                key={s.when}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: 0.25 + i * 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <span className={`absolute -left-[31px] top-1.5 size-2.5 rounded-full ${i >= 2 ? "bg-bad" : "bg-ink-3"}`} />
                <div className="font-mono text-[12px] text-ink-3">{s.when}</div>
                <div className={`mt-1 text-[18px] ${s.tone} ${i === 0 ? "font-serif" : ""}`}>{s.what}</div>
              </motion.li>
            ))}
          </ol>
        </motion.div>
        <motion.div {...rise} className="relative overflow-hidden rounded-[24px] bg-night p-7 text-cream">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgba(217,137,58,.35),transparent_65%)]" aria-hidden />
          <div className="text-[15px] text-cream-2">With Sworn on the call</div>
          <ol className="relative mt-6 space-y-6 border-l border-dashed border-night-rule pl-6">
            {sworn.map((s, i) => (
              <motion.li
                key={s.when}
                initial={reduce ? false : { opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: 0.4 + i * 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <span className={`absolute -left-[31px] top-1.5 size-2.5 rounded-full ${i === 2 ? "bg-[#5fae7d]" : "bg-ember-2"}`} />
                <div className="font-mono text-[12px] text-cream-2">{s.when}</div>
                <div className={`mt-1 text-[18px] ${i === 0 ? "font-serif text-cream" : i === 1 ? "text-ember-2" : "text-[#8fd0a6]"}`}>{s.what}</div>
              </motion.li>
            ))}
          </ol>
        </motion.div>
      </div>
      <motion.p {...rise} className="mt-8 max-w-[70ch] text-[15px] text-ink-2">
        In one audit firm's 2026 data, 88% of SOC 2 exams needed extra rounds of evidence requests and 71% ended with an exception.
        <span className="text-ink-3"> Lazarus Alliance, 75 exams.</span>
      </motion.p>
    </section>
  );
}

/* One verified claim, rendered live from the ledger in each audience's language. */
const AUDIENCES: { key: string; label: string; pick: (r: Renders) => string }[] = [
  { key: "soc2", label: "SOC 2", pick: (r) => r.auditor.soc2 },
  { key: "iso", label: "ISO 27001", pick: (r) => r.auditor.iso27001 },
  { key: "nist", label: "NIST 800-53", pick: (r) => r.auditor.nist80053 },
  { key: "pci", label: "PCI DSS", pick: (r) => r.auditor.pcidss },
  { key: "buyer", label: "A buyer", pick: (r) => r.buyer },
  { key: "board", label: "The board", pick: (r) => r.board },
];

function Translator({ state }: { state: LedgerState | null }) {
  const [tab, setTab] = useState("soc2");
  const [renders, setRenders] = useState<Renders | null>(null);
  const claim: Claim | undefined = state?.claims.find((c) => c.kind === "mfa.enforced") ?? state?.claims.find((c) => c.verdict !== "verified") ?? state?.claims[0];
  useEffect(() => {
    if (claim && state) getRenders(claim.id, state.version).then(setRenders).catch(() => {});
  }, [claim?.id, state?.version]);
  const text = renders ? AUDIENCES.find((a) => a.key === tab)!.pick(renders) : "";
  return (
    <section className="bg-sheet/60 py-24">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-6 md:px-10 lg:grid-cols-[0.8fr_1.2fr]">
        <motion.div {...rise}>
          <h2 className="font-display text-[clamp(36px,5vw,60px)] leading-[1.02]">One answer. Every auditor's language.</h2>
          <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-ink-2">
            The engineer speaks once. Sworn turns it into a typed claim, checks it, and writes each version from the checked facts, so no version can say more than the systems showed.
          </p>
          {claim && (
            <div className="mt-8 rounded-[18px] border border-rule bg-night p-5 font-mono text-[12.5px] leading-[1.9] text-cream">
              <div className="text-cream-2">{claim.id}</div>
              <div>kind: <span className="text-ember-2">{claim.kind}</span></div>
              <div>said: <span className="font-serif text-[14px]">"{claim.statement.slice(0, 60)}"</span></div>
              <div>verdict: <span className={claim.verdict === "verified" ? "text-[#8fd0a6]" : "text-[#f0a48c]"}>{claim.verdict}</span></div>
            </div>
          )}
        </motion.div>
        <motion.div {...rise} className="rounded-[24px] border border-rule bg-sheet p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              {AUDIENCES.map((a) => <TabsTrigger key={a.key} value={a.key}>{a.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <AnimatePresence mode="wait">
            <motion.pre
              key={tab + (renders ? "1" : "0")}
              initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 min-h-[300px] whitespace-pre-wrap font-sans text-[15px] leading-[1.7] text-ink"
            >
              {text || "Loading the ledger…"}
            </motion.pre>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

/* How it works, as one claim's real path rather than a row of icons. */
function SecondAfter() {
  const reduce = useReducedMotion();
  const steps: { t: string; label: string; body: React.ReactNode }[] = [
    { t: "you speak", label: "Heard", body: <span className="font-serif text-[20px]">"MFA's on for everyone."</span> },
    { t: "+0.3 s", label: "Typed", body: <code className="rounded-md bg-night px-2.5 py-1 font-mono text-[12px] text-cream">mfa.enforced · scope everyone · okta, aws</code> },
    { t: "+0.6 s", label: "Checked Okta", body: "41 of 41 active people enrolled in MFA." },
    { t: "+0.8 s", label: "Checked AWS IAM", body: <>11 of 14 users pass. <b className="font-medium text-bad">jsmith-contractor</b> left last week and has no MFA.</> },
    { t: "+1.1 s", label: "Pushed back", body: <span className="font-serif text-[18px] text-ember">"Ah. The IAM report and you have a small disagreement."</span> },
    { t: "+1.4 s", label: "Translated", body: "SOC 2 CC6.1, ISO A.8.5, NIST IA-2(1), PCI 8.4.2, HIPAA 164.312(d)." },
    { t: "call ends", label: "Sealed", body: <span>Ed25519 signature over the packet's fingerprint. Change one word and verification fails.</span> },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24 md:px-10">
      <motion.h2 {...rise} className="max-w-[20ch] font-display text-[clamp(36px,5vw,60px)] leading-[1.02]">What happens in the second after you speak.</motion.h2>
      <div className="mt-14 max-w-[900px]">
        {steps.map((s, i) => (
          <motion.div
            key={s.label}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.55, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-[92px_1fr] gap-6 border-t border-rule py-5 md:grid-cols-[120px_180px_1fr]"
          >
            <span className="pt-1 font-mono text-[11.5px] text-ink-3">{s.t}</span>
            <span className="text-[16px] font-medium md:pt-0.5">{s.label}</span>
            <div className="col-span-2 text-[16px] leading-relaxed text-ink-2 md:col-span-1">{s.body}</div>
            {i === 3 && <div className="col-span-2 md:col-start-3"><Stamp mark="contradicted" /></div>}
          </motion.div>
        ))}
      </div>
      <p className="mt-6 text-[13px] text-ink-3">Timings are typical for the checks; voice turn-taking adds about a second.</p>
    </section>
  );
}
