import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "success" | "error" | "warning" | "neutral" | "pending";
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const variants = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    neutral: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    pending: "bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse",
  };

  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
      variants[status],
      className
    )}>
      {children}
    </span>
  );
}
