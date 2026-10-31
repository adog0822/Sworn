import { CheckCircle, CircleNotch, PhoneDisconnect, XCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Stamp, type Mark } from "./Seal";
import { SystemChip, SYSTEM_NAME } from "./SystemLogo";

// A live component preview of what Sworn does, looping through two real outcomes from the demo company.
type Row = { sys: string; text: string; ok: boolean };
const SCENES: { quote: string; at: string; rows: Row[]; mark: Mark; headline: string; sub: string }[] = [
  {
    quote: "MFA is enforced for everyone through Okta.",
    at: "0:14",
    rows: [
      { sys: "okta", text: "41 of 41 people use MFA", ok: true },
      { sys: "aws", text: "jsmith-contractor has no MFA", ok: false },
    ],
    mark: "contradicted",
    headline: "Caught on the call",
    sub: "A contractor who left last week can still sign in to AWS.",
  },
  {
    quote: "We finished the Q4 access review. Raj signed off in Linear.",
    at: "0:31",
    rows: [
      { sys: "linear", text: "SEC-214 approved by Raj Patel", ok: true },
      { sys: "github", text: "4 of 4 repos in scope reviewed", ok: true },
    ],
    mark: "verified",
    headline: "Claim verified",
    sub: "Saved to the audit ledger and signed.",
  },
];
const CHIPS = ["okta", "aws", "linear", "github"];
const W = 600;
const H = 520;
const CHIP_X = 534;
const chipY = (i: number) => 64 + i * 104;

export function ProofVignette() {
  const reduce = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [step, setStep] = useState(0); // 0 call, 1 quote, 2..3 rows, 4 verdict
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / W)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (reduce) {
      setStep(4);
      return;
    }
    const timings = [700, 1500, 1300, 1300, 3600];
    const t = setTimeout(() => {
      if (step < 4) setStep(step + 1);
      else {
        setStep(0);
        setScene((s) => (s + 1) % SCENES.length);
      }
    }, timings[step]);
    return () => clearTimeout(t);
  }, [step, reduce]);

  const s = SCENES[scene];
  const checking = step >= 2 && step <= 3 ? s.rows[step - 2]?.sys : null;
  const done = (i: number) => step >= 3 + i;

  return (
    <div ref={wrap} className="relative w-full" style={{ height: H * scale }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        {/* beams from the spoken claim to whichever system is being checked */}
        <svg className="pointer-events-none absolute inset-0" width={W} height={H} aria-hidden>
          <defs>
            <linearGradient id="beam" x1="0" x2="1">
              <stop offset="0" stopColor="#b0631a" stopOpacity="0" />
              <stop offset=".5" stopColor="#d9893a" stopOpacity=".95" />
              <stop offset="1" stopColor="#b0631a" stopOpacity=".2" />
            </linearGradient>
          </defs>
          {CHIPS.map((k, i) => {
            const d = `M 420 ${178} C 470 178, 470 ${chipY(i) + 26}, ${CHIP_X - 4} ${chipY(i) + 26}`;
            const active = checking === k || (step >= 4 && s.rows.some((r) => r.sys === k));
            return (
              <g key={k}>
                <path d={d} fill="none" stroke="#e2d9c8" strokeWidth="1.2" strokeDasharray="3 5" />
                {active && (
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="url(#beam)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* systems */}
        {CHIPS.map((k, i) => {
          const row = s.rows.find((r) => r.sys === k);
          const lit = checking === k ? "busy" : row && step >= 4 ? (row.ok ? "ok" : "bad") : false;
          return (
            <div key={k} className="absolute flex flex-col items-center gap-1" style={{ left: CHIP_X, top: chipY(i) }}>
              <SystemChip k={k} size={52} lit={lit} />
              <span className="font-mono text-[9.5px] uppercase tracking-[.14em] text-ink-3">{SYSTEM_NAME[k]}</span>
            </div>
          );
        })}

        {/* the call */}
        <div className="absolute left-0 top-0 w-[420px] rounded-[20px] border border-rule bg-sheet p-4 shadow-[0_30px_60px_-35px_rgba(29,25,19,.45)]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#e9dfcd] font-serif text-[17px] text-ink-2">P</span>
            <div className="leading-tight">
              <div className="text-[15px] font-medium">Calling Priya</div>
              <div className="text-[13px] text-ink-3">Platform lead</div>
            </div>
            <div className="ml-auto flex h-8 items-center gap-[3px]" aria-hidden>
              {Array.from({ length: 22 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="w-[3px] rounded-full bg-ember/80"
                  animate={reduce ? { height: 10 } : { height: [6, 8 + ((i * 7) % 20), 6] }}
                  transition={{ duration: 0.9 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
                />
              ))}
            </div>
            <span className="grid size-9 place-items-center rounded-full bg-[#c2452c] text-white"><PhoneDisconnect size={16} weight="fill" /></span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={scene} className="absolute left-0 top-[96px] w-[420px]" exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}>
            {step >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                className="flex items-start justify-between gap-4 rounded-[18px] border border-rule bg-sheet px-5 py-4"
              >
                <p className="font-serif text-[19px] italic leading-snug text-ink">"{s.quote}"</p>
                <span className="pt-1 font-mono text-[11px] text-ink-3">{s.at}</span>
              </motion.div>
            )}

            <div className="mt-3 space-y-2">
              {s.rows.map((r, i) =>
                step >= 2 + i ? (
                  <motion.div
                    key={r.sys}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-3 rounded-[14px] border border-rule bg-sheet/70 px-4 py-2.5 text-[14px]"
                  >
                    <span className="text-ink-3">{done(i) ? (r.ok ? "Checked" : "Checked") : "Checking"} {SYSTEM_NAME[r.sys]}</span>
                    <span className="truncate text-ink">{done(i) ? r.text : ""}</span>
                    <span className="ml-auto">
                      {!done(i) ? <CircleNotch size={18} className="animate-spin text-ember" /> : r.ok ? <CheckCircle size={19} weight="fill" className="text-ok" /> : <XCircle size={19} weight="fill" className="text-bad" />}
                    </span>
                  </motion.div>
                ) : null,
              )}
            </div>

            {step >= 4 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 22 }}
                className="mt-3 rounded-[18px] border border-rule bg-sheet p-5 shadow-[0_24px_50px_-30px_rgba(29,25,19,.4)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[17px] font-medium">{s.headline}</div>
                  <Stamp mark={s.mark} delay={0.15} />
                </div>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{s.sub}</p>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
