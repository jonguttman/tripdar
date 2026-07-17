"use client";

import { useEffect, useState } from "react";

const AXES = [
  ["clarityCognition", "Clarity / cognition"],
  ["moodSocial", "Mood / social"],
  ["visualPattern", "Visual / pattern"],
  ["somatic", "Body / somatic"],
  ["energyDirection", "Energy direction"],
  ["depthDirection", "Depth direction"],
] as const;

interface ReviewData {
  assignment: { status: string; employeeName: string; expiresAt: string | null };
  product: {
    partnerName: string;
    productName: string;
    brand: string | null;
    format: string;
    sku: string | null;
    doseUnitMg: number | null;
    unitsPerPack: number | null;
    flavors: string[];
    ingredients: string[];
    notes: string | null;
    photos: { id: string; url: string; tag: string; kind: string; isPrimary: boolean }[];
  };
  response: unknown;
}

export default function ReviewClient({ token }: { token: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"known" | "not_familiar">("known");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/myco/product-review/${token}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.error?.message || "Failed to load review");
        setData(json.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load review"));
  }, [token]);

  async function submit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      knowsProduct: mode === "known",
      notes: formData.get("notes"),
    };
    if (mode === "known") {
      for (const [key] of AXES) payload[key] = Number(formData.get(key));
      payload.doseUnitsTried = formData.get("doseUnitsTried");
      payload.doseUnitLabel = formData.get("doseUnitLabel");
      payload.onsetMinutes = formData.get("onsetMinutes");
      payload.durationMinutes = formData.get("durationMinutes");
      payload.flavor = formData.get("flavor");
      payload.confidence = formData.get("confidence");
      payload.familiarity = formData.get("familiarity");
    }

    try {
      const res = await fetch(`/api/myco/product-review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Failed to submit review");
      setDone(mode === "known" ? "Guidance submitted." : "Marked not familiar. Thanks for keeping the data clean.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !data) return <main className="mx-auto max-w-xl p-6 text-sm text-red-700">{error}</main>;
  if (!data) return <main className="mx-auto max-w-xl p-6 text-sm text-neutral-600">Loading review...</main>;
  if (done) return <main className="mx-auto max-w-xl p-6 text-sm text-neutral-900">{done}</main>;

  const primary = data.product.photos.find((photo) => photo.isPrimary) || data.product.photos[0];

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <section className="space-y-4">
        <div>
          <p className="text-sm text-neutral-500">{data.product.partnerName}</p>
          <h1 className="text-2xl font-semibold text-neutral-950">{data.product.productName}</h1>
          <p className="text-sm text-neutral-600">
            {data.product.brand || "Unknown brand"} - {data.product.format}
            {data.product.sku ? ` - ${data.product.sku}` : ""}
          </p>
        </div>

        {primary ? (
          <img
            src={primary.url}
            alt={data.product.productName}
            className="aspect-square w-full rounded-lg border border-neutral-200 object-contain"
          />
        ) : null}

        <div className="grid gap-2 rounded-lg border border-neutral-200 p-3 text-sm text-neutral-700">
          <div>Dose/unit: {data.product.doseUnitMg ? `${data.product.doseUnitMg}mg` : "Unknown"}</div>
          <div>Units/pack: {data.product.unitsPerPack ?? "Unknown"}</div>
          <div>Flavors: {data.product.flavors.length ? data.product.flavors.join(", ") : "Not listed"}</div>
          <div>Ingredients: {data.product.ingredients.length ? data.product.ingredients.join(", ") : "Not listed"}</div>
        </div>
      </section>

      <form action={submit} className="mt-6 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("known")}
            className={`rounded-md border px-3 py-2 text-sm ${mode === "known" ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300"}`}
          >
            I know this product
          </button>
          <button
            type="button"
            onClick={() => setMode("not_familiar")}
            className={`rounded-md border px-3 py-2 text-sm ${mode === "not_familiar" ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300"}`}
          >
            Not familiar enough
          </button>
        </div>

        {mode === "known" ? (
          <div className="space-y-4">
            {AXES.map(([key, label]) => (
              <label key={key} className="block text-sm font-medium text-neutral-800">
                {label}
                <input name={key} type="range" min="0" max="100" defaultValue="50" className="mt-2 w-full" />
              </label>
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              <input name="doseUnitsTried" placeholder="Dose units tried" className="rounded-md border p-2 text-sm" />
              <input name="doseUnitLabel" placeholder="Unit label" className="rounded-md border p-2 text-sm" />
              <input name="onsetMinutes" placeholder="Onset minutes" className="rounded-md border p-2 text-sm" />
              <input name="durationMinutes" placeholder="Duration minutes" className="rounded-md border p-2 text-sm" />
              <input name="flavor" placeholder="Flavor tried" className="rounded-md border p-2 text-sm" />
              <select name="confidence" defaultValue="3" className="rounded-md border p-2 text-sm">
                <option value="1">Confidence 1</option>
                <option value="2">Confidence 2</option>
                <option value="3">Confidence 3</option>
                <option value="4">Confidence 4</option>
                <option value="5">Confidence 5</option>
              </select>
            </div>
            <input name="familiarity" placeholder="Familiarity level" className="w-full rounded-md border p-2 text-sm" />
          </div>
        ) : null}

        <textarea
          name="notes"
          placeholder={mode === "known" ? "Notes" : "Optional note"}
          className="min-h-28 w-full rounded-md border p-2 text-sm"
        />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button disabled={submitting} className="w-full rounded-md bg-neutral-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-60">
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    </main>
  );
}
