import type { LucideIcon } from "lucide-react";

/** Consistent "nothing here yet" panel with a way forward. */
export default function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-2xl bg-nsuk-blue-50" />
        <span className="absolute inset-0 rotate-6 rounded-2xl border border-nsuk-line" />
        <Icon className="relative h-7 w-7 text-nsuk-blue" />
      </span>
      <h3 className="mt-4 font-semibold text-nsuk-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-nsuk-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
