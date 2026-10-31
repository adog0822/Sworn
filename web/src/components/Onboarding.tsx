import { ArrowLeft, ArrowRight, Headset, Microphone, UserCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Role } from "../lib/useCall";
import { cn } from "../lib/utils";
import { Stamp } from "./Seal";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

export const SCRIPTS: Record<Role, string[]> = {
  interview: [
    "We finished the Q4 access review. Raj signed off in Linear.",
    "We removed the three people who left.",
    "MFA is enforced for everyone through Okta.",
  ],
  auditor: [
    "How do you enforce MFA?",
    "What happens to access when someone leaves?",
    "Are production changes reviewed before deploy?",
  ],
};

export function Onboarding({ open, onOpenChange, onStart, initialRole = "interview" }: { open: boolean; onOpenChange: (o: boolean) => void; onStart: (r: Role) => void; initialRole?: Role }) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>(initialRole);
  useEffect(() => {
    if (open) {
      setStep(0);
      setRole(initialRole);
    }
  }, [open, initialRole]);
  const titles = ["Why this exists", "Pick who you are", "Your script"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <div className="flex items-center gap-2 px-7 pt-6">
          {titles.map((t, i) => (
            <span key={t} className={cn("h-1 flex-1 rounded-full transition-colors duration-500", i <= step ? "bg-ember" : "bg-rule")} />
          ))}
        </div>
        <div className="flex items-baseline justify-end px-7 pt-4">
          <button className="text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline" onClick={() => onStart(role)}>Skip to the call</button>
        </div>
        <div className="min-h-[430px] px-7 pb-2 pt-3">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              {step === 0 && <Why />}
              {step === 1 && <Roles role={role} setRole={setRole} />}
              {step === 2 && <Script role={role} />}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between border-t border-rule bg-paper/60 px-7 py-4">
          <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ArrowLeft size={15} /> Back</Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>Continue <ArrowRight size={16} /></Button>
          ) : (
            <Button onClick={() => onStart(role)}><Microphone size={18} weight="fill" /> Start the call</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Why() {
  const reduce = useReducedMotion();
  return (
    <div>
      <DialogTitle className="font-display text-[34px] leading-[1.05]">Engineers say how security works. Auditors check weeks later.</DialogTitle>
      <DialogDescription className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
        When the two don't match, it becomes an exception in the audit report, and enterprise deals wait. Sworn checks while the person is still talking.
      </DialogDescription>
      <div className="mt-8 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-[18px] border border-rule bg-paper p-4">
          <div className="text-[13px] text-ink-3">Priya, on Slack</div>
          <p className="mt-1 font-serif text-[18px]">"We removed everyone who left."</p>
        </motion.div>
        <motion.span initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center text-[14px] text-ink-3">6 weeks later</motion.span>
        <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="rounded-[18px] border border-bad/30 bg-[#fbefe9] p-4">
          <div className="flex items-center justify-between"><span className="text-[13px] text-ink-3">Auditor's finding</span><Stamp mark="contradicted" delay={1.2} /></div>
          <p className="mt-2 text-[15px] text-ink">A contractor who left still had AWS access.</p>
        </motion.div>
      </div>
    </div>
  );
}

function Roles({ role, setRole }: { role: Role; setRole: (r: Role) => void }) {
  const cards: { r: Role; Icon: typeof UserCircle; title: string; who: string; body: string }[] = [
    { r: "interview", Icon: UserCircle, title: "Priya, the engineer", who: "Sworn calls you", body: "You'll make three claims about security. One of them isn't true, and you don't know which. Sworn will find it." },
    { r: "auditor", Icon: Headset, title: "The auditor", who: "You call Sworn", body: "Ask how the company handles MFA, leavers and code review. Try to make it overclaim. It only answers from checked records." },
  ];
  return (
    <div>
      <DialogTitle className="font-display text-[34px] leading-[1.05]">Who do you want to be?</DialogTitle>
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <button
            key={c.r}
            onClick={() => setRole(c.r)}
            className={cn(
              "group rounded-[20px] border p-5 text-left transition-[border-color,box-shadow,transform] duration-300 active:scale-[0.99]",
              role === c.r ? "border-ember bg-[#fbf3e8] shadow-[0_0_0_4px_rgba(176,99,26,.12)]" : "border-rule bg-sheet hover:border-ink-3",
            )}
          >
            <c.Icon size={34} weight="duotone" className={role === c.r ? "text-ember" : "text-ink-3"} />
            <div className="mt-4 text-[14px] text-ink-3">{c.who}</div>
            <div className="mt-1 text-[20px] font-medium">{c.title}</div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{c.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Script({ role }: { role: Role }) {
  const [level, setLevel] = useState(0);
  const [mic, setMic] = useState<"idle" | "on" | "blocked">("idle");
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const testMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let raf = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 60));
        raf = requestAnimationFrame(tick);
      };
      tick();
      setMic("on");
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
      };
    } catch {
      setMic("blocked");
    }
  };
  return (
    <div>
      <DialogTitle className="font-display text-[34px] leading-[1.05]">{role === "interview" ? "Say these, in your own words." : "Ask these, any order."}</DialogTitle>
      <DialogDescription className="mt-2 text-[15px] text-ink-2">
        {role === "interview" ? "Talk the way you would on Slack. When Sworn pushes back, explain or promise a fix." : "Use SOC 2 or ISO terms if you like. Ask for the evidence."}
      </DialogDescription>
      <ol className="mt-6 space-y-3">
        {SCRIPTS[role].map((line, i) => (
          <motion.li key={line} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.12 }} className="flex gap-4 rounded-[16px] border border-rule bg-paper/70 px-4 py-3">
            <span className="pt-1 font-mono text-[11px] text-ink-3">{i + 1}</span>
            <span className="font-serif text-[18px]">"{line}"</span>
          </motion.li>
        ))}
      </ol>
      <div className="mt-6 flex items-center gap-4">
        {mic === "on" ? (
          <>
            <div className="flex h-8 items-end gap-[3px]" aria-label="Microphone level">
              {Array.from({ length: 18 }).map((_, i) => (
                <span key={i} className="h-8 w-[4px] origin-bottom rounded-full bg-ember transition-transform duration-75" style={{ transform: `scaleY(${Math.max(0.12, level * (0.5 + ((i * 37) % 10) / 20))})` }} />
              ))}
            </div>
            <span className="text-[14px] text-ink-2">{level > 0.12 ? "Sounds good." : "Say something to test it."}</span>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={testMic}><Microphone size={15} /> {mic === "blocked" ? "Mic blocked: allow it in the address bar" : "Test your microphone"}</Button>
        )}
      </div>
    </div>
  );
}
