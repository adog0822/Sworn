import { cn } from "../lib/utils";

// Real marks (Simple Icons, devicon for AWS), self-hosted under /logos. Always shown on a light chip.
export function systemKey(system: string): string {
  const s = system.toLowerCase();
  if (s.includes("okta")) return "okta";
  if (s.includes("linear")) return "linear";
  if (s.includes("github")) return "github";
  return "aws";
}

export const SYSTEM_NAME: Record<string, string> = { okta: "Okta", aws: "AWS", linear: "Linear", github: "GitHub" };

export function SystemLogo({ k, size = 20, className }: { k: string; size?: number; className?: string }) {
  return (
    <img
      src={`/logos/${k}.svg`}
      alt={SYSTEM_NAME[k] ?? k}
      width={k === "aws" ? size * 1.5 : size}
      height={size}
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}

export function SystemChip({ k, size = 44, lit, className }: { k: string; size?: number; lit?: "ok" | "bad" | "busy" | false; className?: string }) {
  return (
    <span
      className={cn(
        "relative grid place-items-center rounded-[14px] border bg-sheet transition-[border-color,box-shadow] duration-300",
        lit === "ok" ? "border-ok/50 shadow-[0_0_0_4px_rgba(45,106,70,.10)]" : lit === "bad" ? "border-bad/60 shadow-[0_0_0_4px_rgba(162,56,31,.12)]" : lit === "busy" ? "border-ember/50 shadow-[0_0_0_4px_rgba(176,99,26,.10)]" : "border-rule",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <SystemLogo k={k} size={Math.round(size * 0.45)} />
    </span>
  );
}
