"use client";

/**
 * Myco customer flow: age gate → guided intake → results → save-your-results.
 *
 * Kiosk mode (?kiosk=1): larger touch targets, idle timeout resets to the
 * age gate so the next customer starts fresh. Browser mode remembers the
 * age gate in localStorage.
 *
 * Non-negotiable copy on every screen: "Everyone is different. Start low
 * and go slow." + not-medical-advice disclaimer.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const KIOSK_IDLE_RESET_MS = 2 * 60 * 1000;
const AGE_GATE_KEY = "myco_age_confirmed";

type Stage = "age_gate" | "intents" | "experience" | "intensity" | "format" | "loading" | "results";

const INTENT_OPTIONS = [
  { id: "focus", emoji: "🎯", label: "Focus & flow", description: "Clear-headed concentration" },
  { id: "creativity", emoji: "🎨", label: "Creativity", description: "New ideas, seeing differently" },
  { id: "sleep", emoji: "🌙", label: "Rest & sleep", description: "Winding down, settling" },
  { id: "anxiety_relief", emoji: "🍃", label: "Ease & calm", description: "Quieting the noise" },
  { id: "first_time", emoji: "🌱", label: "Curious first-timer", description: "A gentle introduction" },
  { id: "spiritual", emoji: "✨", label: "Spiritual journey", description: "Depth and inner exploration" },
  { id: "social", emoji: "💬", label: "Social & connected", description: "Warmth, laughter, people" },
  { id: "healing", emoji: "💜", label: "Healing & processing", description: "Working through something" },
];

const EXPERIENCE_OPTIONS = [
  { id: "new", label: "Never tried", description: "This would be my first time" },
  { id: "few_times", label: "A few times", description: "I've dipped my toes in" },
  { id: "experienced", label: "Comfortable", description: "I know what works for me" },
  { id: "very_experienced", label: "Very experienced", description: "I've explored deeply" },
];

const INTENSITY_OPTIONS = [
  { id: "gentle", label: "Gentle", description: "Subtle — I want to stay functional" },
  { id: "moderate", label: "Noticeable", description: "A clear shift, still grounded" },
  { id: "deep", label: "Deep", description: "I want to really go there" },
];

const FORMAT_OPTIONS = [
  { id: "no_preference", label: "Surprise me", description: "Whatever fits best" },
  { id: "capsule", label: "Capsules", description: "Precise and tasteless" },
  { id: "edible", label: "Edibles", description: "Gummies, chocolates" },
  { id: "dried", label: "Dried", description: "The classic way" },
  { id: "tincture", label: "Tincture", description: "Drops under the tongue" },
];

interface DoseGuidance {
  tierLabel: string;
  unitsText: string;
  mgLow: number | null;
  mgHigh: number | null;
  guidanceText: string;
  offsetNote?: string;
  steppedNote?: string;
}

interface ResultItem {
  rank: number;
  productName: string;
  brandName: string | null;
  format: string;
  photoUrl: string | null;
  flavors: string[];
  onsetMinutes: number | null;
  durationMinutes: number | null;
  keyVibes: string[];
  strainMatch: boolean;
  strainName: string | null;
  doseGuidance: DoseGuidance | null;
  brandDoseInstructions: string | null;
  reflection: string;
}

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  padding: "1.25rem",
  boxShadow: "0 4px 20px rgba(124,58,237,0.08)",
};

function formatDuration(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes >= 60) {
    const hrs = minutes / 60;
    return `${hrs % 1 === 0 ? hrs.toFixed(0) : hrs.toFixed(1)} hrs`;
  }
  return `${minutes} min`;
}

export default function MycoFlow({
  partnerSlug,
  storeName,
  welcomeMessage,
  kiosk,
}: {
  partnerSlug: string;
  storeName: string;
  welcomeMessage: string | null;
  kiosk: boolean;
}) {
  const [stage, setStage] = useState<Stage>("age_gate");
  const [intents, setIntents] = useState<string[]>([]);
  const [experience, setExperience] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetFlow = useCallback(() => {
    setStage("age_gate");
    setIntents([]);
    setExperience(null);
    setIntensity(null);
    setResults([]);
    setSessionToken(null);
    setError(null);
    setEmail("");
    setEmailState("idle");
  }, []);

  // Browser mode: remember age confirmation. Kiosk: always re-gate.
  useEffect(() => {
    if (!kiosk && typeof window !== "undefined" && localStorage.getItem(AGE_GATE_KEY) === "1") {
      setStage("intents");
    }
  }, [kiosk]);

  // Kiosk idle reset — any interaction restarts the clock.
  useEffect(() => {
    if (!kiosk) return;
    const bump = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(resetFlow, KIOSK_IDLE_RESET_MS);
    };
    bump();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump));
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [kiosk, resetFlow]);

  const confirmAge = () => {
    if (!kiosk && typeof window !== "undefined") localStorage.setItem(AGE_GATE_KEY, "1");
    setStage("intents");
  };

  const toggleIntent = (id: string) => {
    setIntents((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const submit = async (formatPreference: string) => {
    setStage("loading");
    setError(null);
    try {
      const res = await fetch("/api/myco/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerSlug,
          intents,
          experienceLevel: experience,
          intensity,
          formatPreference,
          kiosk,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResults(data.results);
      setSessionToken(data.sessionToken);
      setStage("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage("format");
    }
  };

  const submitEmail = async () => {
    if (emailState === "sending") return;
    setEmailState("sending");
    try {
      const res = await fetch("/api/myco/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, partnerSlug, sessionToken }),
      });
      if (!res.ok) throw new Error();
      setEmailState("done");
    } catch {
      setEmailState("error");
    }
  };

  const touchSize = kiosk ? "1.15rem" : "1rem";
  const optionPadding = kiosk ? "1.25rem 1.1rem" : "0.9rem 1rem";

  const optionButton = (selected: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: optionPadding,
    borderRadius: 14,
    border: selected ? "2px solid #7c3aed" : "2px solid #eee",
    background: selected ? "#f5f0ff" : "white",
    cursor: "pointer",
    fontSize: touchSize,
    fontFamily: "inherit",
  });

  const primaryButton: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: kiosk ? "1.2rem" : "0.95rem",
    borderRadius: 14,
    border: "none",
    background: "#7c3aed",
    color: "white",
    fontSize: touchSize,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const stepHeader = (title: string, subtitle: string) => (
    <div style={{ marginBottom: "1.25rem" }}>
      <h1 style={{ fontSize: kiosk ? "1.6rem" : "1.35rem", margin: 0, fontWeight: 700 }}>{title}</h1>
      <p style={{ color: "#666", margin: "0.4rem 0 0", fontSize: "0.95rem", lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #faf5ff 0%, #fdf2f8 100%)",
        padding: "1.5rem 1rem 1rem",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#1a1a1a",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", width: "100%", flex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c3aed", fontWeight: 600 }}>
            🍄 Myco
          </div>
          <div style={{ fontSize: "0.85rem", color: "#666", marginTop: 4 }}>{storeName}</div>
        </div>

        {stage === "age_gate" && (
          <div style={{ ...card, textAlign: "center", padding: "2rem 1.5rem" }}>
            <div style={{ fontSize: "2.5rem" }}>🍄</div>
            <h1 style={{ fontSize: "1.4rem", margin: "0.75rem 0 0.5rem" }}>Welcome</h1>
            <p style={{ color: "#666", fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
              {welcomeMessage ||
                "Myco helps you understand what you're looking for and which products the community says are most likely to get you there."}
            </p>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem" }}>
              You must be 21 or older to continue.
            </p>
            <button style={primaryButton} onClick={confirmAge}>
              I&apos;m 21 or older
            </button>
            <p style={{ fontSize: "0.75rem", color: "#999", marginTop: "1rem", lineHeight: 1.5 }}>
              This is not medical advice. Consult a healthcare provider before use.
            </p>
          </div>
        )}

        {stage === "intents" && (
          <div style={card}>
            {stepHeader("What are you hoping to feel?", "Pick up to three — whatever speaks to you.")}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
              {INTENT_OPTIONS.map((opt) => (
                <button key={opt.id} style={optionButton(intents.includes(opt.id))} onClick={() => toggleIntent(opt.id)}>
                  <div style={{ fontWeight: 700 }}>
                    {opt.emoji} {opt.label}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#666", marginTop: 2 }}>{opt.description}</div>
                </button>
              ))}
            </div>
            <button
              style={{ ...primaryButton, marginTop: "1.25rem", opacity: intents.length === 0 ? 0.4 : 1 }}
              disabled={intents.length === 0}
              onClick={() => setStage("experience")}
            >
              Continue
            </button>
          </div>
        )}

        {stage === "experience" && (
          <div style={card}>
            {stepHeader("How familiar are you with mushrooms?", "There's no wrong answer — this just helps calibrate.")}
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  style={optionButton(experience === opt.id)}
                  onClick={() => {
                    setExperience(opt.id);
                    setStage("intensity");
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "#666", marginTop: 2 }}>{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "intensity" && (
          <div style={card}>
            {stepHeader("How deep do you want to go?", "We'll suggest a starting point on the brand's own dose ladder.")}
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {INTENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  style={optionButton(intensity === opt.id)}
                  onClick={() => {
                    setIntensity(opt.id);
                    setStage("format");
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "#666", marginTop: 2 }}>{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "format" && (
          <div style={card}>
            {stepHeader("Any preference on form?", "Capsules, gummies, the classic — or let the match decide.")}
            {error && (
              <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 10, padding: "0.75rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {FORMAT_OPTIONS.map((opt) => (
                <button key={opt.id} style={optionButton(false)} onClick={() => submit(opt.id)}>
                  <div style={{ fontWeight: 700 }}>{opt.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "#666", marginTop: 2 }}>{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "loading" && (
          <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
            <div style={{ fontSize: "2rem" }}>🍄</div>
            <p style={{ color: "#666", marginTop: "1rem" }}>Listening to what you told us…</p>
          </div>
        )}

        {stage === "results" && (
          <div>
            <div style={{ marginBottom: "1rem" }}>
              <h1 style={{ fontSize: kiosk ? "1.5rem" : "1.3rem", margin: 0 }}>
                Based on what you told us
              </h1>
              <p style={{ color: "#666", fontSize: "0.85rem", margin: "0.35rem 0 0", lineHeight: 1.5 }}>
                These are matches based on your goals and community experience — not medical advice.
              </p>
            </div>

            <div style={{ display: "grid", gap: "1rem" }}>
              {results.map((r) => (
                <div key={r.rank} style={card}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt={r.productName} style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 72, height: 72, borderRadius: 12, background: "#f3e8ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>
                        🍄
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {r.brandName && (
                        <div style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {r.brandName}
                        </div>
                      )}
                      <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>{r.productName}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        <span style={{ fontSize: "0.7rem", background: "#f3e8ff", color: "#6d28d9", borderRadius: 999, padding: "2px 8px", fontWeight: 600 }}>
                          {r.format}
                        </span>
                        {r.strainMatch && r.strainName && (
                          <span style={{ fontSize: "0.7rem", background: "#ecfdf5", color: "#047857", borderRadius: 999, padding: "2px 8px", fontWeight: 600 }}>
                            ⭐ {r.strainName} — strain match
                          </span>
                        )}
                        {r.keyVibes.map((v) => (
                          <span key={v} style={{ fontSize: "0.7rem", background: "#faf5ff", color: "#7c3aed", borderRadius: 999, padding: "2px 8px" }}>
                            {v.split(":")[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {r.flavors.length > 0 && (
                    <div style={{ fontSize: "0.78rem", color: "#666", marginTop: "0.6rem" }}>
                      Comes in: {r.flavors.join(" · ")}
                    </div>
                  )}

                  <p style={{ fontSize: "0.88rem", lineHeight: 1.6, color: "#444", margin: "0.85rem 0 0" }}>{r.reflection}</p>

                  {r.doseGuidance && (
                    <div style={{ background: "#faf5ff", borderRadius: 12, padding: "0.85rem", marginTop: "0.85rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        A typical starting point
                      </div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 4 }}>
                        {r.doseGuidance.unitsText}
                        {r.doseGuidance.mgLow !== null && (
                          <span style={{ fontWeight: 400, color: "#666" }}>
                            {" "}({r.doseGuidance.mgLow}{r.doseGuidance.mgHigh && r.doseGuidance.mgHigh !== r.doseGuidance.mgLow ? `–${r.doseGuidance.mgHigh}` : ""}mg)
                          </span>
                        )}
                        <span style={{ fontWeight: 400, color: "#666" }}> · {r.doseGuidance.tierLabel}</span>
                      </div>
                      {r.doseGuidance.offsetNote && (
                        <p style={{ fontSize: "0.78rem", color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: "0.5rem 0.6rem", margin: "0.6rem 0 0", lineHeight: 1.5 }}>
                          {r.doseGuidance.offsetNote}
                        </p>
                      )}
                      {r.doseGuidance.steppedNote && (
                        <p style={{ fontSize: "0.78rem", color: "#555", margin: "0.6rem 0 0", lineHeight: 1.5 }}>{r.doseGuidance.steppedNote}</p>
                      )}
                    </div>
                  )}

                  {(formatDuration(r.onsetMinutes) || formatDuration(r.durationMinutes)) && (
                    <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem", fontSize: "0.78rem", color: "#666" }}>
                      {formatDuration(r.onsetMinutes) && <span>Onset ~{formatDuration(r.onsetMinutes)}</span>}
                      {formatDuration(r.durationMinutes) && <span>Lasts ~{formatDuration(r.durationMinutes)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ ...card, marginTop: "1rem", background: "#f5f0ff" }}>
              {emailState === "done" ? (
                <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
                  💌 You&apos;re in. We&apos;ll help you keep track of what you try and how it lands — every report makes
                  the next match better for everyone.
                </p>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Save your matches</div>
                  <p style={{ fontSize: "0.82rem", color: "#555", margin: "0.35rem 0 0.75rem", lineHeight: 1.5 }}>
                    Leave your email and tripd.ar will help you track what you try, check in on how it went, and
                    sharpen your next match.
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={{ flex: 1, padding: "0.7rem 0.85rem", borderRadius: 10, border: "1px solid #ddd", fontSize: "0.9rem", fontFamily: "inherit" }}
                    />
                    <button
                      style={{ ...primaryButton, width: "auto", padding: "0.7rem 1.1rem" }}
                      onClick={submitEmail}
                      disabled={emailState === "sending"}
                    >
                      {emailState === "sending" ? "…" : "Save"}
                    </button>
                  </div>
                  {emailState === "error" && (
                    <p style={{ fontSize: "0.78rem", color: "#b91c1c", margin: "0.5rem 0 0" }}>
                      That didn&apos;t work — double-check the email and try again.
                    </p>
                  )}
                </>
              )}
            </div>

            <button
              style={{ ...primaryButton, marginTop: "1rem", background: "white", color: "#7c3aed", border: "2px solid #7c3aed" }}
              onClick={resetFlow}
            >
              Start over
            </button>
          </div>
        )}
      </div>

      <footer style={{ textAlign: "center", padding: "1.25rem 1rem 0.5rem", maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#6d28d9" }}>
          Everyone is different. Start low and go slow.
        </div>
        <div style={{ fontSize: "0.72rem", color: "#999", marginTop: 4, lineHeight: 1.5 }}>
          These are community-experience matches, not medical advice. Consult a healthcare provider.
        </div>
      </footer>
    </div>
  );
}
