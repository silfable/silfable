import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap border text-xs font-semibold uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-paper bg-paper text-ink hover:bg-transparent hover:text-paper",
        outline: "border-white/40 bg-transparent text-paper hover:border-paper hover:bg-paper hover:text-ink",
        blue: "border-[var(--atlas-coral)] bg-[var(--atlas-coral)] text-[var(--atlas-night)] hover:border-[#ff8376] hover:bg-[#ff8376] hover:text-[var(--atlas-night)]",
      },
      size: {
        default: "h-12 px-6",
        lg: "h-14 px-8",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
