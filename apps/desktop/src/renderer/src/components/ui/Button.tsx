import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "border-[#ff8a00] bg-[#ff8a00] text-[#160a02] shadow-[0_10px_28px_rgb(255_138_0/0.16)] hover:border-[#ffad45] hover:bg-[#ffad45]",
        secondary: "border-border bg-secondary text-secondary-foreground hover:border-[#ff8a00]/45 hover:bg-[#ff8a00]/8 hover:text-[#ffad45]",
        danger: "border-red-300/30 bg-destructive text-white shadow-[0_10px_28px_rgb(255_72_94/0.2)] hover:brightness-110",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:border-[#ff8a00]/35 hover:bg-[#ff8a00]/8 hover:text-[#ffad45]",
        outline: "border-[#ff8a00]/35 bg-[#ff8a00]/5 text-[#ffad45] hover:border-[#ff8a00]/60 hover:bg-[#ff8a00]/12",
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
