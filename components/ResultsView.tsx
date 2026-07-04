"use client";

import { useState } from "react";
import type { GeneratedComponent } from "@/lib/generate";
import type { PackageBrief } from "@/lib/brief";

export default function ResultsView({
  packageId,
  brief,
  components,
  onReplaceComponent,
  onStartOver,
}: {
  packageId: string;
  brief: PackageBrief;
  components: GeneratedComponent[];
  onReplaceComponent: (c: GeneratedComponent) => void;
  onStartOver: () => void;
}) {
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [regenSlug, setRegenSlug] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [attach, setAttach] = useState<{ state: "idle" | "working" | "done" | "error"; msg?: string }>({
    state: "idle",
  });

  const groups = ["Email", "Ad", "Page", "Editorial"] as const;
  const preview = components.find((c) => c.slug === previewSlug) ?? null;

  async function doRegenerate(slug: string) {
    setRegenerating((s) => new Set(s).add(slug));
    setRegenSlug(null);
    const fb = feedback;
    setFeedback("");
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, slug, feedback: fb }),
      });
      const json = await res.json();
      if (json.component) onReplaceComponent(json.component);
    } finally {
      setRegenerating((s) => {
        const n = new Set(s);
        n.delete(slug);
        return n;
      });
    }
  }

  async function doAttach() {
    setAttach({ state: "working" });
    try {
      const res = await fetch("/api/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAttach({ state: "error", msg: json.error ?? "Attach failed" });
        return;
      }
      setAttach({ state: "done", msg: `Attached ${json.attached} component(s) to the analyzer draft.` });
    } catch {
      setAttach({ state: "error", msg: "Attach failed" });
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }} className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-2xl font-bold">📦 {brief.title}</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {[brief.publisher, brief.primaryGuru, brief.promoType].filter(Boolean).join(" · ") || "Package ready"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export?packageId=${packageId}`}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            ⬇ Download all (.zip)
          </a>
          <button onClick={onStartOver} className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--surface-2)" }}>
            New package
          </button>
        </div>
      </div>

      {/* Attach to analyzer */}
      <div className="rounded-lg p-3 mb-5 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--surface)" }}>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Save this package to the Promo Analyzer draft so it becomes training data once the promo launches.
        </span>
        {attach.state === "done" ? (
          <span className="text-xs" style={{ color: "var(--success)" }}>✓ {attach.msg}</span>
        ) : (
          <button
            onClick={doAttach}
            disabled={attach.state === "working"}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            {attach.state === "working" ? "Attaching…" : "Attach to analyzer"}
          </button>
        )}
      </div>
      {attach.state === "error" && (
        <p className="text-xs mb-4" style={{ color: "var(--danger)" }}>{attach.msg}</p>
      )}

      {/* Components grouped */}
      {groups.map((group) => {
        const inGroup = components.filter((c) => c.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              {group}
            </h3>
            <div className="space-y-2">
              {inGroup.map((c) => {
                const busy = regenerating.has(c.slug);
                const highFindings = c.findings.filter((f) => f.severity === "high").length;
                return (
                  <div key={c.slug} className="rounded-lg p-3" style={{ background: "var(--surface)" }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{c.label}</span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {c.error ? "failed" : `${c.items.length} ${c.perItem ? "variations" : "doc"}`}
                        </span>
                        {c.findings.length === 0 && !c.error ? (
                          <span className="text-xs" style={{ color: "var(--success)" }}>✓ compliant</span>
                        ) : c.findings.length > 0 ? (
                          <span className="text-xs" style={{ color: highFindings ? "var(--danger)" : "var(--warn)" }}>
                            ⚠ {c.findings.length} claim{c.findings.length > 1 ? "s" : ""} to review
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {busy ? (
                          <span style={{ color: "var(--text-muted)" }}>Regenerating…</span>
                        ) : (
                          <>
                            <button onClick={() => setPreviewSlug(c.slug)} className="underline" disabled={!!c.error}>
                              Preview
                            </button>
                            <button onClick={() => { setRegenSlug(c.slug); setFeedback(""); }} className="underline">
                              Regenerate
                            </button>
                            <a href={`/api/export?packageId=${packageId}&slug=${c.slug}`} className="underline" style={{ color: "var(--accent)" }}>
                              Download
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Regenerate feedback box */}
                    {regenSlug === c.slug && (
                      <div className="mt-2 flex gap-2">
                        <input
                          autoFocus
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          placeholder="Optional: what to change (e.g. more urgency, punchier hooks)"
                          className="flex-1 rounded px-2 py-1.5 text-xs"
                          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                          onKeyDown={(e) => e.key === "Enter" && doRegenerate(c.slug)}
                        />
                        <button onClick={() => doRegenerate(c.slug)} className="px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: "var(--accent)" }}>
                          Go
                        </button>
                      </div>
                    )}

                    {c.error && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{c.error}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setPreviewSlug(null)}
        >
          <div
            className="rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">{preview.label}</h3>
              <button onClick={() => setPreviewSlug(null)} className="text-sm" style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            {preview.findings.length > 0 && (
              <div className="rounded-lg p-3 mb-3 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--warn)" }}>
                <p className="font-semibold mb-1" style={{ color: "var(--warn)" }}>Claims to review:</p>
                {preview.findings.map((f, i) => (
                  <div key={i} className="mb-1">
                    <span style={{ color: "var(--warn)" }}>[{f.severity}]</span> "{f.quote}" — {f.issue}. <em>Fix: {f.fix}</em>
                  </div>
                ))}
              </div>
            )}

            {preview.items.map((item, i) => (
              <div key={i} className="mb-4">
                {preview.perItem && (
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--accent)" }}>
                    {preview.label} #{i + 1}
                    {item.voice === "guru" ? "  (guru voice)" : ""}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-sm" style={{ fontFamily: "inherit" }}>
                  {item.text}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
