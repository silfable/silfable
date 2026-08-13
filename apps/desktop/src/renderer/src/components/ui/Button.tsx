import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-emerald-100/25 bg-linear-to-r from-[#087f63] via-[#0d986f] to-[#169f79] text-white shadow-[0_10px_28px_rgb(8_127_99/0.3)] hover:brightness-110",
        secondary: "border-border bg-secondary text-secondary-foreground hover:border-emerald-200/30 hover:bg-[color-mix(in_srgb,var(--secondary)_72%,#20c997)]",
        danger: "border-red-300/30 bg-destructive text-white shadow-[0_10px_28px_rgb(255_72_94/0.2)] hover:brightness-110",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
        outline: "border-emerald-300/30 bg-emerald-300/5 text-emerald-200 hover:bg-emerald-300/12",
      },
      size: {
        sm: "h-8 px-3 text-[10px]",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-sm",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant, size, fullWidth, loading = false, icon, disabled, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  ),
);

Button.displayName = "Button";
