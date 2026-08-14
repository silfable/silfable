import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

const inputClass = "flex min-h-10 w-full rounded-xl border border-input bg-[#0d0b09]/95 px-3 py-2 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-[#ff8a00]/70 focus:ring-2 focus:ring-[#ff8a00]/15 disabled:cursor-not-allowed disabled:opacity-50";

type FieldMeta = { label?: string | undefined; error?: string | undefined; helperText?: string | undefined };

function FieldShell({ label, error, helperText, children }: FieldMeta & { children: React.ReactNode }) {
  return <div className="flex w-full flex-col gap-1.5">
    {label && <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{label}</label>}
    {children}
    {error && <span className="text-xs text-red-300">{error}</span>}
    {helperText && !error && <span className="text-xs text-muted-foreground">{helperText}</span>}
  </div>;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldMeta {}
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, helperText, className, ...props }, ref) => (
  <FieldShell label={label} error={error} helperText={helperText}>
    <input ref={ref} className={cn(inputClass, error && "border-red-400/70", className)} {...props} />
  </FieldShell>
));
Input.displayName = "Input";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldMeta {}
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ label, error, helperText, className, ...props }, ref) => (
  <FieldShell label={label} error={error} helperText={helperText}>
    <textarea ref={ref} className={cn(inputClass, "min-h-24 resize-y", error && "border-red-400/70", className)} {...props} />
  </FieldShell>
));
TextArea.displayName = "TextArea";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldMeta {}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, helperText, className, children, ...props }, ref) => (
  <FieldShell label={label} error={error} helperText={helperText}>
    <select ref={ref} className={cn(inputClass, "cursor-pointer", error && "border-red-400/70", className)} {...props}>{children}</select>
  </FieldShell>
));
Select.displayName = "Select";
