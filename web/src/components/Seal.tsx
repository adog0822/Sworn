import { Seal as SealIcon, SealCheck, SealWarning } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "../lib/utils";
import type { Claim } from "../lib/api";

export type Mark = "verified" | "partial" | "contradicted" | "drifted" | "sealed";

const MARKS: Record<Mark, { label: string; cls: string; night: string; Icon: typeof SealIcon }> = {
  verified: { label: "Verified", cls: "text-ok", night: "text-[#8fd0a6]", Icon: SealCheck },
  partial: { label: "Partly true", cls: "text-meh", night: "text-[#e9c27a]", Icon: SealIcon },
  contradicted: { label: "Not true", cls: "text-bad", night: "text-[#f3a088]", Icon: SealWarning },
  drifted: { label: "No longer true", cls: "text-drift", night: "text-[#c3a8f0]", Icon: SealWarning },
  sealed: { label: "Sealed", cls: "text-ink", night: "text-cream", Icon: SealIcon },
};

export const markOf = (c: Pick<Claim, "verdict" | "status">): Mark =>
  c.status === "drifted" ? "drifted" : c.verdict === "unverifiable" ? "partial" : c.verdict;

// A notary-style mark: seal glyph plus small-caps mono label, ink only, no pill fill.
export function Seal({ mark, className, dark }: { mark: Mark; className?: string; dark?: boolean }) {
  const m = MARKS[mark];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[.14em]", dark ? m.night : m.cls, className)}>
      <m.Icon size={16} weight="duotone" aria-hidden />
      {m.label}
    </span>
  );
}

// The moment of judgement: a seal pressed into the page.
export function Stamp({ mark, delay = 0, dark }: { mark: Mark; delay?: number; dark?: boolean }) {
  const m = MARKS[mark];
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={reduce ? false : { scale: 1.9, rotate: -14, opacity: 0 }}
      animate={{ scale: 1, rotate: -4, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay }}
      className={cn("relative inline-flex items-center gap-2 rounded-[6px] border-[1.5px] border-current px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.16em]", dark ? m.night : m.cls)}
    >
      <m.Icon size={18} weight="fill" aria-hidden />
      {m.label}
      {!reduce && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-[6px] border border-current"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.7, delay: delay + 0.12, ease: "easeOut" }}
        />
      )}
    </motion.span>
  );
}
