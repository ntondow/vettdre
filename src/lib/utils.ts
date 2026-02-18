import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-emerald-600 bg-emerald-50";
  if (score >= 70) return "text-amber-600 bg-amber-50";
  if (score >= 50) return "text-orange-600 bg-orange-50";
  return "text-red-600 bg-red-50";
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "Hot";
  if (score >= 70) return "Warm";
  if (score >= 50) return "Developing";
  return "Cold";
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w ]+/g, "").replace(/ +/g, "-");
}
