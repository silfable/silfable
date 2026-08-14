import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border px-2.5 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "border-[rgb(255_138_0_/_0.46)] bg-[rgb(255_138_0_/_0.1)] text-[var(--sc-orange)]",
        outline: "border-white/20 bg-transparent text-white/55",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
