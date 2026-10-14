import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  PENDING: "bg-pending/12 text-pending ring-pending/30",
  APPROVED: "bg-active/12 text-active ring-active/30",
  REJECTED: "bg-expired/12 text-expired ring-expired/30",
  REVOKED: "bg-suspended/12 text-suspended ring-suspended/30",
};

export function ReviewBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset", tones[status] ?? "bg-muted text-muted-foreground ring-border")}>
      {status}
    </span>
  );
}

export function FilterTabs<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-lg border bg-card p-1">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
          {o}
        </button>
      ))}
    </div>
  );
}
