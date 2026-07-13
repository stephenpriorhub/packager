"use client";

import { useMemo, useState } from "react";
import { HOTLIST_COMPONENTS, HOTLIST_DEFAULT_SLUGS, hotlistComponents } from "@/lib/components";

export interface HotlistPayload {
  form: FormData;
  slugs: string[];
}

export default function HotlistForm({
  onSubmit,
  busy,
}: {
  onSubmit: (payload: HotlistPayload) => void;
  busy: boolean;
}) {
  const [signup, setSignup] = useState<File | null>(null);
  const [promo, setPromo] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [selected, setSelected] = useState<string[]>(HOTLIST_DEFAULT_SLUGS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);

  const runComponents = useMemo(() => hotlistComponents(selected), [selected]);
  const perItem = runComponents.filter((c) => c.perItem);

  function toggle(slug: string) {
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  }

  function submit() {
    if (!signup || selected.length === 0) return;
    const fd = new FormData();
    fd.append("signup", signup);
    if (promo) fd.append("promo", promo);
    fd.append("title", title || signup.name.replace(/\.[^.]+$/, ""));
    fd.append("publisher", publisher);
    fd.append("product", product);
    fd.append("price", price);
    fd.append("eventName", eventName);
    fd.append("eventDate", eventDate);
    fd.append("assets", JSON.stringify(selected));
    fd.append("quantities", JSON.stringify(quantities));
    onSubmit({ form: fd, slugs: selected });
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="p-6">
      <h1 className="text-2xl font-bold mb-1">🔥 Hotlist Builder</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Upload a hotlist sign-up page (and, optionally, the promo behind it). Get back the
        event-registration assets — lift notes, space ads, and text ads — with the same catalyst
        craft as the VSL lift notes.
      </p>

      {/* Sign-up page drop zone (required) */}
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
          if (f) setSignup(f);
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
          onChange={(e) => setSignup(e.target.files?.[0] ?? null)}
        />
        {signup ? (
          <div>
            <div className="text-lg">📄 {signup.name}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {(signup.size / 1024).toFixed(0)} KB · click to replace
            </div>
          </div>
        ) : (
          <div>
            <div className="text-lg font-medium">Drop the hotlist sign-up page here, or click to browse</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              .docx, .pdf, or .txt · the event registration landing page
            </div>
          </div>
        )}
      </label>

      {/* Optional promo */}
      <label className="block mt-3">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Optional: the promo behind the event (for extra context on the offer)
        </span>
        <div
          className="mt-1 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: promo ? "var(--text)" : "var(--text-muted)" }}>
            {promo ? `📎 ${promo.name}` : "Attach a promo (.docx, .pdf, .txt)"}
          </span>
          {promo && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setPromo(null);
              }}
              className="text-xs underline"
              style={{ color: "var(--text-muted)" }}
            >
              remove
            </button>
          )}
          <input
            type="file"
            accept=".pdf,.docx,.doc,.txt,.md"
            className="hidden"
            onChange={(e) => setPromo(e.target.files?.[0] ?? null)}
          />
        </div>
      </label>

      {/* Event details — asked like the main tool */}
      <div className="grid grid-cols-2 gap-3 mt-5">
        <Field label="Event name" value={eventName} onChange={setEventName} placeholder="e.g. The AI Trade Summit" />
        <Field label="Event date / time" value={eventDate} onChange={setEventDate} placeholder="e.g. Aug 14, 1pm ET" />
        <Field label="Publisher" value={publisher} onChange={setPublisher} placeholder="e.g. Monument Traders Alliance" />
        <Field label="Product revealed / sold" value={product} onChange={setProduct} placeholder="e.g. The War Room" />
        <Field label="Price / terms" value={price} onChange={setPrice} placeholder="e.g. $79/yr, 365-day guarantee" />
        <Field label="Campaign name" value={title} onChange={setTitle} placeholder="Auto from filename" />
      </div>

      {/* Asset picker */}
      <div className="mt-5">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Assets to generate
        </span>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {HOTLIST_COMPONENTS.map((c) => (
            <label key={c.slug} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.includes(c.slug)} onChange={() => toggle(c.slug)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Advanced quantities */}
      {perItem.length > 0 && (
        <>
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
                    onChange={(e) => setQuantities((q) => ({ ...q, [c.slug]: Number(e.target.value) }))}
                    className="w-16 rounded px-2 py-1 text-right"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  />
                </label>
              ))}
            </div>
          )}
        </>
      )}

      {/* Generate */}
      <button
        disabled={!signup || selected.length === 0 || busy}
        onClick={submit}
        className="w-full mt-6 py-3 rounded-xl font-semibold text-white transition-opacity"
        style={{
          background: !signup || selected.length === 0 || busy ? "var(--surface-2)" : "var(--accent)",
          opacity: !signup || selected.length === 0 || busy ? 0.6 : 1,
          cursor: !signup || selected.length === 0 || busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Working…" : `Generate hotlist assets (${runComponents.length} component${runComponents.length === 1 ? "" : "s"})`}
      </button>
      <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>
        Sit tight — generating the full set can take a few minutes.
      </p>
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
