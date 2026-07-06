"use client";

import { useState } from "react";
import UploadForm, { type GeneratePayload } from "@/components/UploadForm";
import GeneratingView, { type CompStatus } from "@/components/GeneratingView";
import ResultsView from "@/components/ResultsView";
import TrainingLibrary from "@/components/TrainingLibrary";
import PackageLibrary from "@/components/PackageLibrary";
import { componentsForRun } from "@/lib/components";
import type { GeneratedComponent } from "@/lib/generate";
import type { PackageBrief } from "@/lib/brief";

type Phase = "upload" | "generating" | "results";
interface Row {
  slug: string;
  label: string;
  status: CompStatus;
}

export default function Home() {
  const [tab, setTab] = useState<"generate" | "packages" | "training">("generate");
  const [phase, setPhase] = useState<Phase>("upload");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [brief, setBrief] = useState<PackageBrief | null>(null);
  const [components, setComponents] = useState<GeneratedComponent[]>([]);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate({ form }: GeneratePayload) {
    setError("");
    const includeHotlist = form.get("includeHotlist") === "true";
    const expected = componentsForRun(includeHotlist);
    setRows(expected.map((c) => ({ slug: c.slug, label: c.label, status: "pending" })));
    setTotal(expected.length);
    setCompleted(0);
    setComponents([]);
    setBrief(null);
    setPackageId(null);
    setMessage("Uploading…");
    setPhase("generating");

    try {
      const res = await fetch("/api/generate", { method: "POST", body: form });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Generation failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          handleEvent(evt);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setPhase("upload");
    }
  }

  async function openPackage(id: string) {
    const res = await fetch(`/api/packages?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Package not found");
    const { package: pkg } = await res.json();
    setError("");
    setBrief(pkg.brief);
    setComponents(pkg.components);
    setPackageId(pkg.id);
    setPhase("results");
    setTab("generate");
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case "status":
        setMessage(evt.message as string);
        break;
      case "brief":
        setBrief(evt.brief as PackageBrief);
        setMessage("Writing components…");
        break;
      case "start":
        setRows((rs) =>
          rs.map((r) => (r.slug === evt.slug ? { ...r, status: "running" } : r))
        );
        break;
      case "component": {
        const c = evt.component as GeneratedComponent;
        setComponents((cs) => [...cs.filter((x) => x.slug !== c.slug), c]);
        setRows((rs) =>
          rs.map((r) => (r.slug === c.slug ? { ...r, status: c.error ? "error" : "done" } : r))
        );
        if (typeof evt.completed === "number") setCompleted(evt.completed);
        if (typeof evt.total === "number") setTotal(evt.total);
        break;
      }
      case "done":
        setPackageId(evt.packageId as string);
        setPhase("results");
        break;
      case "error":
        setError(evt.message as string);
        setPhase("upload");
        break;
    }
  }

  return (
    <main className="min-h-screen">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 pt-4" style={{ maxWidth: 960, margin: "0 auto" }}>
        {(
          [
            { id: "generate", label: "📦 Generate" },
            { id: "packages", label: "📁 Past Packages" },
            { id: "training", label: "🎓 Training Library" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-t-lg text-sm font-medium"
            style={{
              background: tab === t.id ? "var(--surface)" : "transparent",
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "training" && <TrainingLibrary />}

      {tab === "packages" && <PackageLibrary onOpen={openPackage} />}

      {tab === "generate" && error && (
        <div className="max-w-2xl mx-auto mt-4 px-4">
          <div className="rounded-lg p-3 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--danger)", color: "var(--danger)" }}>
            {error}
          </div>
        </div>
      )}

      {tab === "generate" && phase === "upload" && <UploadForm onSubmit={handleGenerate} busy={false} />}

      {tab === "generate" && phase === "generating" && (
        <GeneratingView message={message} rows={rows} completed={completed} total={total} />
      )}

      {tab === "generate" && phase === "results" && brief && packageId && (
        <ResultsView
          packageId={packageId}
          brief={brief}
          components={components}
          onReplaceComponent={(c) =>
            setComponents((cs) => [...cs.filter((x) => x.slug !== c.slug), c])
          }
          onStartOver={() => setPhase("upload")}
        />
      )}
    </main>
  );
}
