import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

// shadcn/ui Button, re-skinned: one ember primary, paper outline, glass for the dark call room.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[transform,background-color,border-color,color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ember text-white hover:bg-[#9c5615] shadow-[0_10px_30px_-12px_rgba(176,99,26,.7),inset_0_1px_0_rgba(255,255,255,.18)]",
        outline: "border border-rule bg-sheet text-ink hover:border-ink-3",
        ghost: "text-ink-2 hover:text-ink hover:bg-black/[.04]",
        glass: "border border-white/10 bg-white/[.06] text-cream hover:bg-white/[.1] shadow-[inset_0_1px_0_rgba(255,255,255,.08)]",
        danger: "bg-[#c2452c] text-white hover:bg-[#ad3a23]",
      },
      size: { sm: "h-9 px-4 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-14 px-7 text-base", icon: "size-14" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
