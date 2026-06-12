"use client";

import { useState } from "react";

const SLIDERS = [
  { key: "clarityCognition", label: "Mind", low: "Scattered", high: "Focused" },
  { key: "moodSocial", label: "Mood", low: "Inward", high: "Social" },
  { key: "visualPattern", label: "Visuals", low: "Subtle", high: "Vivid" },
  { key: "somatic", label: "Body", low: "Light", high: "Heavy" },
  { key: "energyDirection", label: "Energy", low: "Calm", high: "Energetic" },
  { key: "depthDirection", label: "Depth", low: "Clear", high: "Dreamy" },
] as const;

const ONSET_BUCKETS = [
  { value: "under_15", label: "< 15 min" },
  { value: "15_30", label: "15–30 min" },
  { value: "30_60", label: "30–60 min" },
  { value: "60_plus", label: "1 hr+" },
];

const DURATION_BUCKETS = [
  { value: "under_2", label: "< 2 hr" },
  { value: "2_4", label: "2–4 hr" },
  { value: "4_6", label: "4–6 hr" },
  { value: "6_plus", label: "6 hr+" },
];

const RELATIONSHIPS = [
  { value: "staff", label: "Staff" },
  { value: "regular", label: "Regular customer" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

export default function TesterVoteForm({
  catalogItemId,
  flavors = [],
}: {
  catalogItemId: string;
  flavors?: string[];
}) {
  const [voterName, setVoterName] = useState("");
  const [flavor, setFlavor] = useState("");
  const [voterEmail, setVoterEmail] = useState("");
  const [voterPhone, setVoterPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [sliders, setSliders] = useState<Record<string, number>>({
    clarityCognition: 50, moodSocial: 50, visualPattern: 50,
    somatic: 50, energyDirection: 50, depthDirection: 50,
  });
  const [onsetBucket, setOnsetBucket] = useState("");
  const [durationBucket, setDurationBucket] = useState("");
  const [unitsTaken, setUnitsTaken] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!voterName.trim() || !voterEmail.trim()) {
      setError("Name and email are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tester-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogItemId,
          voterName,
          voterEmail,
          voterPhone: voterPhone || undefined,
          relationship: relationship || undefined,
          ...sliders,
          onsetBucket: onsetBucket || undefined,
          durationBucket: durationBucket || undefined,
          unitsTaken: unitsTaken ? Number(unitsTaken) : undefined,
          flavor: flavor || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🙏</div>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "1.2rem" }}>Thank you!</h3>
        <p style={{ color: "#666", fontSize: "0.9rem", lineHeight: 1.5 }}>
          Your feedback was recorded. It'll help future shoppers find the right experience.
        </p>
      </div>
    );
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "0.7rem 0.85rem", borderRadius: 10, border: "1px solid #e5e7eb",
    fontSize: "1rem", fontFamily: "inherit", boxSizing: "border-box", background: "#fafafa",
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#374151", marginBottom: 6,
  };
  const section: React.CSSProperties = { marginBottom: "1.1rem" };

  return (
    <form onSubmit={submit}>
      <h3 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#7c3aed", margin: "0 0 0.75rem 0" }}>
        Who are you?
      </h3>

      <div style={section}>
        <label style={label}>Your name *</label>
        <input style={input} value={voterName} onChange={e => setVoterName(e.target.value)} required />
      </div>

      <div style={section}>
        <label style={label}>Email *</label>
        <input style={input} type="email" value={voterEmail} onChange={e => setVoterEmail(e.target.value)} required />
      </div>

      <div style={section}>
        <label style={label}>Phone (optional)</label>
        <input style={input} type="tel" value={voterPhone} onChange={e => setVoterPhone(e.target.value)} />
      </div>

      <div style={section}>
        <label style={label}>You are a…</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {RELATIONSHIPS.map(r => (
            <button key={r.value} type="button" onClick={() => setRelationship(r.value)} style={{
              padding: "0.45rem 0.85rem", borderRadius: 999, fontSize: "0.85rem", cursor: "pointer",
              border: relationship === r.value ? "1.5px solid #7c3aed" : "1px solid #e5e7eb",
              background: relationship === r.value ? "#f5f3ff" : "white",
              color: relationship === r.value ? "#7c3aed" : "#555",
              fontWeight: relationship === r.value ? 600 : 400,
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      <h3 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#7c3aed", margin: "1.5rem 0 0.75rem 0" }}>
        Your experience
      </h3>

      {flavors.length > 0 && (
        <div style={section}>
          <label style={label}>Which flavor did you try?</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...flavors, ""].map((f) => (
              <button key={f || "_unsure"} type="button" onClick={() => setFlavor(f)} style={{
                padding: "0.45rem 0.85rem", borderRadius: 999, fontSize: "0.85rem", cursor: "pointer",
                border: flavor === f ? "1.5px solid #7c3aed" : "1px solid #e5e7eb",
                background: flavor === f ? "#f5f3ff" : "white",
                color: flavor === f ? "#7c3aed" : "#555",
                fontWeight: flavor === f ? 600 : 400,
              }}>{f || "Not sure"}</button>
            ))}
          </div>
        </div>
      )}

      <div style={section}>
        <label style={label}>How many units did you take?</label>
        <input style={input} type="number" step="0.25" min="0" value={unitsTaken} onChange={e => setUnitsTaken(e.target.value)} placeholder="e.g. 1" />
      </div>

      <div style={section}>
        <label style={label}>How fast did effects start?</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {ONSET_BUCKETS.map(b => (
            <button key={b.value} type="button" onClick={() => setOnsetBucket(b.value)} style={{
              padding: "0.55rem 0.5rem", borderRadius: 10, fontSize: "0.85rem", cursor: "pointer",
              border: onsetBucket === b.value ? "1.5px solid #7c3aed" : "1px solid #e5e7eb",
              background: onsetBucket === b.value ? "#f5f3ff" : "white",
              color: onsetBucket === b.value ? "#7c3aed" : "#555",
              fontWeight: onsetBucket === b.value ? 600 : 400,
            }}>{b.label}</button>
          ))}
        </div>
      </div>

      <div style={section}>
        <label style={label}>How long did it last?</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {DURATION_BUCKETS.map(b => (
            <button key={b.value} type="button" onClick={() => setDurationBucket(b.value)} style={{
              padding: "0.55rem 0.5rem", borderRadius: 10, fontSize: "0.85rem", cursor: "pointer",
              border: durationBucket === b.value ? "1.5px solid #7c3aed" : "1px solid #e5e7eb",
              background: durationBucket === b.value ? "#f5f3ff" : "white",
              color: durationBucket === b.value ? "#7c3aed" : "#555",
              fontWeight: durationBucket === b.value ? 600 : 400,
            }}>{b.label}</button>
          ))}
        </div>
      </div>

      <h3 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#7c3aed", margin: "1.5rem 0 0.75rem 0" }}>
        How did it feel?
      </h3>

      {SLIDERS.map(s => (
        <div key={s.key} style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>{s.label}</span>
            <span style={{ fontSize: "0.75rem", color: "#999" }}>{sliders[s.key]}</span>
          </div>
          <input type="range" min={0} max={100} value={sliders[s.key]}
            onChange={e => setSliders({ ...sliders, [s.key]: Number(e.target.value) })}
            style={{ width: "100%", accentColor: "#7c3aed" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#999", marginTop: 2 }}>
            <span>{s.low}</span><span>{s.high}</span>
          </div>
        </div>
      ))}

      <div style={section}>
        <label style={label}>Any notes? (optional)</label>
        <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything notable — taste, comeup, comedown, vibe…" />
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: "0.7rem", borderRadius: 10, fontSize: "0.85rem", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} style={{
        width: "100%", padding: "0.95rem", borderRadius: 12, border: "none",
        background: submitting ? "#a78bfa" : "linear-gradient(135deg, #7c3aed, #ec4899)",
        color: "white", fontSize: "1rem", fontWeight: 700, cursor: submitting ? "default" : "pointer",
        boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
      }}>
        {submitting ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
