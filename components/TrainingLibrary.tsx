"use client";

import { useEffect, useState } from "react";

interface Row {
  reviewId: string;
  title: string;
  publisher: string | null;
  gurus: string[];
  promoType: string | null;
  promoStatus: string | null;
  fromPackager: boolean;
  hasPerformanceData: boolean;
  performanceScore: number | null;
  isBestPerformer: boolean;
  effectivenessScore: number | null;
  componentCount: number;
  categories: string[];
  trained: boolean;
  trainedComponentCount: number;
  ingestedAt: string | null;
}

interface Coverage {
  slug: string;
  label: string;
  hotlist: boolean;
  exemplars: number;
}

export default function TrainingLibrary() {
  const [rows, setRows] = useState<Row[]>([]);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/training", { cache: "no-store" });
      const json = await res.json();
      setRows(json.rows ?? []);
      setCoverage(json.coverage ?? []);
    } catch {
      setNotice("Couldn't reach the analyzer — try again in a minute.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function ingest(reviewId: string) {
    setBusy((s) => new Set(s).add(reviewId));
    setNotice("");
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error ?? "Training failed");
      } else {
        setNotice(
          `✓ Ingested ${json.ingested} component(s)` +
            (json.failed?.length ? ` — couldn't read: ${json.failed.join(", ")}` : "")
        );
        await load();
      }
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(reviewId);
        return n;
      });
    }
  }

  async function remove(reviewId: string) {
    setBusy((s) => new Set(s).add(reviewId));
    try {
      await fetch(`/api/training?reviewId=${encodeURIComponent(reviewId)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(reviewId);
        return n;
      });
    }
  }

  const shown = rows.filter(
    (r) =>
      !filter ||
      r.title.toLowerCase().includes(filter.toLowerCase()) ||
      (r.publisher ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      r.gurus.some((g) => g.toLowerCase().includes(filter.toLowerCase()))
  );

  const standard = coverage.filter((c) => !c.hotlist);
  const hotlist = coverage.filter((c) => c.hotlist);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }} className="p-6">
      <h1 className="text-2xl font-bold mb-1">Training Library</h1>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        Teach The Packager from real past packages. Attach a promo's components in the
        analyzer's Documents tab, then click <strong>Use for training</strong> here — those
        pieces become live examples for every future generation.
      </p>

      {/* Coverage */}
      <div className="rounded-xl p-4 mb-6" style={{ background: "var(--surface)" }}>
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          What The Packager can learn from today
        </h3>
        <CoverageChips items={standard} />
        <h4 className="text-xs font-semibold mt-3 mb-1" style={{ color: "var(--text-muted)" }}>
          Hotlist
        </h4>
        <CoverageChips items={hotlist} />
      </div>

      {notice && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {notice}
        </div>
      )}

      {/* Search */}
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search promos, publications, gurus…"
        className="w-full rounded-lg px-3 py-2 text-sm mb-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading promos from the analyzer…
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const isBusy = busy.has(r.reviewId);
            const perf = r.isBestPerformer
              ? "★ Best performer"
              : r.performanceScore != null
              ? `Perf ${r.performanceScore}/10`
              : r.effectivenessScore != null
              ? `Copy ${r.effectivenessScore}/10`
              : null;
            return (
              <div key={r.reviewId} className="rounded-lg p-3" style={{ background: "var(--surface)" }}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.fromPackager ? "📦 " : ""}
                      {r.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {[r.publisher, r.gurus.join("/"), r.promoType].filter(Boolean).join(" · ") || "—"}
                      {perf ? (
                        <span style={{ color: r.isBestPerformer ? "var(--warn)" : undefined }}> · {perf}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs" style={{ color: r.componentCount > 0 ? "var(--text)" : "var(--text-muted)" }}>
                      {r.componentCount > 0
                        ? `${r.componentCount} component${r.componentCount > 1 ? "s" : ""}`
                        : "no components"}
                    </span>
                    {r.trained ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: "var(--success)" }}>
                          ✓ Training ({r.trainedComponentCount})
                        </span>
                        <button
                          onClick={() => ingest(r.reviewId)}
                          disabled={isBusy}
                          className="text-xs underline"
                          style={{ color: "var(--text-muted)" }}
                          title="Re-ingest to pick up newly attached components"
                        >
                          {isBusy ? "…" : "refresh"}
                        </button>
                        <button
                          onClick={() => remove(r.reviewId)}
                          disabled={isBusy}
                          className="text-xs underline"
                          style={{ color: "var(--danger)" }}
                        >
                          remove
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => ingest(r.reviewId)}
                        disabled={isBusy || r.componentCount === 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                        style={{
                          background: r.componentCount === 0 ? "var(--surface-2)" : "var(--accent)",
                          opacity: isBusy ? 0.6 : 1,
                          cursor: r.componentCount === 0 ? "not-allowed" : "pointer",
                        }}
                        title={
                          r.componentCount === 0
                            ? "Attach components in the analyzer's Documents tab first"
                            : "Ingest this promo's components as training examples"
                        }
                      >
                        {isBusy ? "Ingesting…" : "Use for training"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {shown.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No promos match.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageChips({ items }: { items: Coverage[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c.slug}
          className="px-2 py-1 rounded-full text-xs"
          style={{
            background: c.exemplars > 0 ? "rgba(34,197,94,0.15)" : "var(--surface-2)",
            color: c.exemplars > 0 ? "var(--success)" : "var(--text-muted)",
            border: "1px solid var(--border)",
          }}
          title={
            c.exemplars > 0
              ? `${c.exemplars} real example(s) available`
              : "No trained examples yet — generation uses brain methodology only"
          }
        >
          {c.label} {c.exemplars > 0 ? `· ${c.exemplars}` : "· 0"}
        </span>
      ))}
    </div>
  );
}
