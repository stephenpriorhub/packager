"use client";

export type CompStatus = "pending" | "running" | "done" | "error";

export default function GeneratingView({
  message,
  rows,
  completed,
  total,
}: {
  message: string;
  rows: { slug: string; label: string; status: CompStatus }[];
  completed: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const icon = (s: CompStatus) =>
    s === "done" ? "✅" : s === "running" ? "⏳" : s === "error" ? "⚠️" : "◻️";

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }} className="p-6">
      <h2 className="text-xl font-bold mb-1">Building your package…</h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>

      <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: "var(--surface-2)" }}>
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: "var(--accent)" }}
        />
      </div>
      <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
        {completed} of {total} components
      </p>

      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.slug}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
            style={{
              background: "var(--surface)",
              opacity: r.status === "pending" ? 0.5 : 1,
            }}
          >
            <span>{icon(r.status)}</span>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
