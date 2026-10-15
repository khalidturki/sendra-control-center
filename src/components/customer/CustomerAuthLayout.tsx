import type { ReactNode } from "react";
import logoAsset from "@/assets/sendra-logo.png.asset.json";
import { Label } from "@/components/ui/label";

export function CustomerAuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-5 py-10">
      <div className="w-full max-w-sm animate-rise">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <img src={logoAsset.url} alt="Sendra" className="h-10 w-11 object-contain" />
          <span className="font-display text-xl font-semibold">Sendra</span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function FormField({ id, label, error, children }: { id: string; label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</div>;
}
