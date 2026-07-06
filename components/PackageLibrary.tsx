"use client";

import { useEffect, useState } from "react";
import type { PackageBrief } from "@/lib/brief";

interface PackageRow {
  id: string;
  createdAt: string;
  brief: PackageBrief;
  componentCount: number;
}

export default function PackageLibrary({
  onOpen,
}: {
  onOpen: (id: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/packages", { cache: "no-store" });
        const json = await res.json();
        setRows(json.packages ?? []);
      } catch {
        setNotice("Couldn't load past packages — try again in a minute.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function open(id: string) {
    setOpening(id);
    setNotice("");
    try {
      await onOpen(id);
    } catch {
      setNotice("Couldn't open that package — try again.");
    } finally {
      setOpening(null);
    }
  }

  const q = filter.toLowerCase();
  const shown = rows.filter(
    (r) =>
      !q ||
      r.brief.title.toLowerCase().includes(q) ||
      (r.brief.publisher ?? "").toLowerCase().includes(q) ||
      (r.brief.promoType ?? "").toLowerCase().includes(q) ||
      r.brief.gurus.some((g) => g.toLowerCase().includes(q))
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }} className="p-6">
      <h1 className="text-2xl font-bold mb-1">Past Packages</h1>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        Every package you&apos;ve generated. Open one to preview, regenerate, or
        re-download its components.
      </p>

      {notice && (
        <div
          className="rounded-lg p-3 mb-4 text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {notice}
        </div>
      )}

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search by promo, publication, guru, promo type…"
        className="w-full rounded-lg px-3 py-2 text-sm mb-3"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      />

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading packages…
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className="rounded-lg p-3" style={{ background: "var(--surface)" }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">📦 {r.brief.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {[
                      r.brief.publisher,
                      r.brief.gurus.join("/"),
                      r.brief.promoType,
                      r.brief.isHotlist ? "Hotlist" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {" · "}
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.componentCount} component{r.componentCount === 1 ? "" : "s"}
                  </span>
                  <a
                    href={`/api/export?packageId=${r.id}`}
                    className="text-xs underline"
                    style={{ color: "var(--accent)" }}
                  >
                    Download
                  </a>
                  <button
                    onClick={() => open(r.id)}
                    disabled={opening !== null}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: "var(--accent)", opacity: opening === r.id ? 0.6 : 1 }}
                  >
                    {opening === r.id ? "Opening…" : "Open"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {shown.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {rows.length === 0 ? "No packages generated yet." : "No packages match."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
