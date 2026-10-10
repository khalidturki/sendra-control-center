import { cn } from "@/lib/utils";
import type { SubStatus } from "@/lib/sendra";

const styles: Record<SubStatus, string> = {
  PENDING: "bg-pending/12 text-pending ring-pending/30",
  ACTIVE: "bg-active/12 text-active ring-active/30",
  EXPIRED: "bg-expired/12 text-expired ring-expired/30",
  SUSPENDED: "bg-suspended/12 text-suspended ring-suspended/30",
};
const dot: Record<SubStatus, string> = {
  PENDING: "bg-pending",
  ACTIVE: "bg-active",
  EXPIRED: "bg-expired",
  SUSPENDED: "bg-suspended",
};

export function StatusBadge({ status, className }: { status: SubStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        styles[status],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot[status], status === "ACTIVE" && "animate-pulse")} />
      {status}
    </span>
  );
}

export function StateBox({ title, body, action, tone = "muted" }: { title: string; body?: string; action?: React.ReactNode; tone?: "muted" | "error" }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center", tone === "error" && "border-destructive/40 bg-destructive/5")}>
      <p className={cn("font-display text-base font-semibold", tone === "error" && "text-destructive")}>{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
