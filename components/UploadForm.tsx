"use client";

import { useMemo, useState } from "react";
import { ALL_COMPONENTS, componentsForRun } from "@/lib/components";

export interface GeneratePayload {
  form: FormData;
  componentCount: number;
}

export default function UploadForm({
  onSubmit,
  busy,
}: {
  onSubmit: (payload: GeneratePayload) => void;
  busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [includeHotlist, setIncludeHotlist] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

  const runComponents = useMemo(() => componentsForRun(includeHotlist), [includeHotlist]);
  const perItem = runComponents.filter((c) => c.perItem);

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || file.name.replace(/\.[^.]+$/, ""));
    fd.append("publisher", publisher);
    fd.append("product", product);
    fd.append("price", price);
    fd.append("includeHotlist", includeHotlist ? "true" : "false");
    fd.append("eventName", eventName);
    fd.append("eventDate", eventDate);
    fd.append("quantities", JSON.stringify(quantities));
    onSubmit({ form: fd, componentCount: runComponents.length });
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="p-6">
      <h1 className="text-2xl font-bold mb-1">📦 The Packager</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Upload an unlaunched promo. Get the full copy package back — one document per component.
      </p>

      {/* Drop zone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        className="block rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
        style={{
          borderColor: dragOver ? "var(--accent)" : "var(--border)",
          background: dragOver ? "var(--surface-2)" : "var(--surface)",
        }}
      >
        <input
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div>
            <div className="text-lg">📄 {file.name}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {(file.size / 1024).toFixed(0)} KB · click to replace
            </div>
          </div>
        ) : (
          <div>
            <div className="text-lg font-medium">Drop your promo here, or click to browse</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              .docx, .pdf, or .txt
            </div>
          </div>
        )}
      </label>

      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <Field label="Package / promo name" value={title} onChange={setTitle} placeholder="Auto from filename" />
        <Field label="Publication" value={publisher} onChange={setPublisher} placeholder="e.g. Trade of the Day" />
        <Field label="Product" value={product} onChange={setProduct} placeholder="Optional" />
        <Field label="Price / terms" value={price} onChange={setPrice} placeholder="e.g. $79/yr, 365-day guarantee" />
      </div>

      {/* Hotlist */}
      <label className="flex items-center gap-2 mt-5 cursor-pointer">
        <input
          type="checkbox"
          checked={includeHotlist}
          onChange={(e) => setIncludeHotlist(e.target.checked)}
        />
        <span className="text-sm font-medium">
          This is a Hotlist (live event) — also generate hotlist assets
        </span>
      </label>
      {includeHotlist && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Event name" value={eventName} onChange={setEventName} placeholder="e.g. The AI Trade Summit" />
          <Field label="Event date" value={eventDate} onChange={setEventDate} placeholder="e.g. Aug 14, 1pm ET" />
        </div>
      )}

      {/* Advanced quantities */}
      <button
        onClick={() => setShowAdvanced((s) => !s)}
        className="text-xs mt-5 underline"
        style={{ color: "var(--text-muted)" }}
      >
        {showAdvanced ? "▾ Hide" : "▸ Advanced"} — adjust how many of each
      </button>
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-lg" style={{ background: "var(--surface)" }}>
          {perItem.map((c) => (
            <label key={c.slug} className="flex items-center justify-between gap-2 text-xs">
              <span>{c.label}</span>
              <input
                type="number"
                min={c.minQty}
                max={c.maxQty}
                defaultValue={c.defaultQty}
                onChange={(e) =>
                  setQuantities((q) => ({ ...q, [c.slug]: Number(e.target.value) }))
                }
                className="w-16 rounded px-2 py-1 text-right"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              />
            </label>
          ))}
        </div>
      )}

      {/* Generate */}
      <button
        disabled={!file || busy}
        onClick={submit}
        className="w-full mt-6 py-3 rounded-xl font-semibold text-white transition-opacity"
        style={{
          background: !file || busy ? "var(--surface-2)" : "var(--accent)",
          opacity: !file || busy ? 0.6 : 1,
          cursor: !file || busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Working…" : `Generate the full package (${runComponents.length} components)`}
      </button>
      {ALL_COMPONENTS.length > 0 && (
        <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>
          Sit tight — a full package can take a few minutes.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 rounded-lg px-3 py-2 text-sm"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      />
    </label>
  );
}
