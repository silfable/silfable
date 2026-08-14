import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function shorten(value: string): string {
  if (!value || value.length < 10) return value;
  return value.slice(0, 4) + '...' + value.slice(-4);
}

export function cleanErrorMessage(error: unknown): string {
  if (!error) return "";
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+'?:\s*/iu, "")
    .replace(/^Error:\s*/iu, "")
    .trim();
}

