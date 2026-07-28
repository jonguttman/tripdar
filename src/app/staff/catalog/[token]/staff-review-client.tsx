"use client";

/**
 * KEWL-2335 — staff catalog review, mobile first.
 *
 * Three screens in one component: PIN sign-in, the product list ordered by urgency, and
 * the per-product field review. Every field answer saves on its own the
 * moment it is tapped — staff do this in short bursts behind a counter, so nothing
 * waits for a "submit the whole product" step and nothing is ever lost mid-product.
 */

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ types --- */

type Screen = "identify" | "list" | "detail";
type FieldTier = "A" | "B" | "C";
type InputType = "text" | "number" | "list" | "strain" | "photo_check";
type FieldStateName = "unreviewed" | "confirmed" | "disputed" | "unknown" | "needs_re_review";
type SourceValue = "packaging" | "brand-provided" | "personal-knowledge" | "unsure";
type ReviewAction = "confirm" | "correct" | "fill" | "confirmed_absent" | "dont_know";
type UrgencyTier = 1 | 2 | 3 | 4;

interface Reviewer {
  id: string;
  name: string;
  hasPin: boolean;
  lockedOut: boolean;
}

interface Bootstrap {
  partnerName: string;
  /** The link identifies the reviewer (KEWL-2364) — there is no "pick your name" step. */
  signedIn: boolean;
  reviewer: Reviewer;
}

interface SessionResult {
  employeeId: string;
  employeeName: string;
  firstUse: boolean;
}

interface ListProduct {
  id: string;
  productName: string;
  brand: string | null;
  format: string;
  photoUrl: string | null;
  researchOnly: boolean;
  urgencyTier: UrgencyTier;
  urgencyLabel: string;
  disputedFields: string[];
  fieldsOwedByYou: number;
  verifiedFieldCount: number;
  reviewableFieldCount: number;
  listable: boolean;
  listedViaOverride: boolean;
  blockerCount: number;
}

interface ListData {
  reviewer: { id: string; name: string };
  coverage: { fullyReviewed: number; total: number; owedByYou: number };
  products: ListProduct[];
}

interface DetailField {
  fieldName: string;
  label: string;
  helpText: string | null;
  tier: FieldTier;
  inputType: InputType;
  allowsConfirmedAbsent: boolean;
  requiredConfirmations: number;
  confirmationsCount: number;
  state: FieldStateName;
  currentValue: unknown;
  competingValues: unknown[];
  yourAnswer: unknown;
  yourAnswerAt: string | null;
  owedByYou: boolean;
}

interface Blocker {
  kind: string;
  fieldName: string | null;
  label: string;
}

interface DetailData {
  reviewer: { id: string; name: string };
  product: {
    id: string;
    productName: string;
    brand: string | null;
    format: string;
    sku: string | null;
    researchOnly: boolean;
    photos: { id: string; url: string; tag: string; isPrimary: boolean }[];
  };
  fields: DetailField[];
  notes: { note: unknown; createdAt: string; byYou: boolean }[];
  gate: {
    listable: boolean;
    viaOverride: boolean;
    blockers: Blocker[];
    verifiedFieldCount: number;
    requiredFieldCount: number;
  };
}

interface SaveResult {
  saved: number;
  fieldStates: Record<
    string,
    {
      state?: FieldStateName;
      confirmationsCount?: number;
      requiredConfirmations?: number;
    }
  >;
  gate: { listable: boolean; blockers: number };
}

interface AnswerPayload {
  fieldName: string;
  action: ReviewAction;
  value?: unknown;
  source?: SourceValue;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
}

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string | null; status: number };

/* -------------------------------------------------------------- constants --- */

const CONFIRMED_ABSENT_VALUE = "__confirmed_absent__";
const DONT_KNOW_VALUE = "__unknown__";

const TIER_ORDER: UrgencyTier[] = [3, 1, 2, 4];

const TIER_HEADINGS: Record<UrgencyTier, string> = {
  3: "Disputed — needs a tiebreak",
  1: "Nobody has reviewed this",
  2: "You haven't reviewed this",
  4: "You're done here",
};

const TIER_BLURBS: Record<UrgencyTier, string> = {
  3: "Two people gave different answers. Yours breaks the tie.",
  1: "Nothing on these has been checked by anyone yet.",
  2: "Someone else looked at these, you haven't.",
  4: "Nothing left for you on these.",
};

const SOURCES: { value: SourceValue; label: string }[] = [
  { value: "packaging", label: "On the package" },
  { value: "brand-provided", label: "Brand told us" },
  { value: "personal-knowledge", label: "I know this" },
  { value: "unsure", label: "Not sure" },
];

const FIELD_TIER_STYLES: Record<FieldTier, string> = {
  A: "border-amber-300 bg-amber-50 text-amber-900",
  B: "border-sky-300 bg-sky-50 text-sky-900",
  C: "border-neutral-300 bg-neutral-50 text-neutral-700",
};

/* ---------------------------------------------------------------- helpers --- */

/** Human-readable form of a stored field value, or `null` when there is nothing there. */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value === CONFIRMED_ABSENT_VALUE) return "Confirmed: not on the package";
  if (value === DONT_KNOW_VALUE) return null;
  if (Array.isArray(value)) {
    const joined = value.map((entry) => String(entry).trim()).filter(Boolean).join(", ");
    return joined.length ? joined : null;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  return text.length ? text : null;
}

function hasValue(value: unknown): boolean {
  return formatValue(value) !== null;
}

const FIELD_STATE_COPY: Record<FieldStateName, string> = {
  unreviewed: "Not reviewed yet",
  confirmed: "Verified",
  disputed: "Disputed",
  unknown: "Nobody knew",
  needs_re_review: "Changed — needs another look",
};

function fieldStateStyle(state: FieldStateName): string {
  if (state === "disputed") return "border-red-300 bg-red-50 text-red-800";
  if (state === "confirmed") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (state === "needs_re_review") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

/* ---------------------------------------------------------- root component --- */

export default function StaffReviewClient({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>("identify");

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const [list, setList] = useState<ListData | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<ApiResult<T>> => {
      try {
        const res = await fetch(`/api/myco/staff-review/${token}${path}`, {
          credentials: "same-origin",
          ...init,
        });
        const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
        if (!res.ok || !json || json.success !== true || json.data === undefined) {
          return {
            ok: false,
            message: json?.error?.message ?? "Something went wrong. Try that again.",
            code: json?.error?.code ?? null,
            status: res.status,
          };
        }
        return { ok: true, data: json.data };
      } catch {
        return {
          ok: false,
          message: "Couldn't reach the server. Check your connection and try again.",
          code: null,
          status: 0,
        };
      }
    },
    [token]
  );

  /** Session expired mid-flow — drop back to the PIN screen without losing the link. */
  const requireSignIn = useCallback(() => {
    setDetail(null);
    setList(null);
    setScreen("identify");
    setBootstrap((prev) => (prev ? { ...prev, signedIn: false } : prev));
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const res = await request<ListData>("/products");
    setListLoading(false);
    if (!res.ok) {
      if (res.status === 401 && res.code === "pin_required") {
        requireSignIn();
        return;
      }
      setListError(res.message);
      return;
    }
    setList(res.data);
  }, [request, requireSignIn]);

  const openProduct = useCallback(
    async (productId: string) => {
      setScreen("detail");
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      const res = await request<DetailData>(`/products/${productId}`);
      setDetailLoading(false);
      if (!res.ok) {
        if (res.status === 401 && res.code === "pin_required") {
          requireSignIn();
          return;
        }
        setDetailError(res.message);
        return;
      }
      setDetail(res.data);
    },
    [request, requireSignIn]
  );

  /** Quiet re-read after a save, so `currentValue` / disputes reflect the server. */
  const refreshDetail = useCallback(
    async (productId: string) => {
      const res = await request<DetailData>(`/products/${productId}`);
      if (res.ok) setDetail(res.data);
    },
    [request]
  );

  const submitAnswer = useCallback(
    async (productId: string, answer: AnswerPayload): Promise<string | null> => {
      const res = await request<SaveResult>(`/products/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: [answer] }),
      });
      if (!res.ok) {
        if (res.status === 401 && res.code === "pin_required") requireSignIn();
        return res.message;
      }
      const saved = res.data;
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fields: prev.fields.map((field) => {
            const next = saved.fieldStates[field.fieldName];
            if (!next) return field;
            return {
              ...field,
              state: next.state ?? field.state,
              confirmationsCount: next.confirmationsCount ?? field.confirmationsCount,
              requiredConfirmations: next.requiredConfirmations ?? field.requiredConfirmations,
            };
          }),
          gate: { ...prev.gate, listable: saved.gate.listable },
        };
      });
      void refreshDetail(productId);
      return null;
    },
    [refreshDetail, request, requireSignIn]
  );

  const submitNote = useCallback(
    async (productId: string, note: string): Promise<string | null> => {
      const res = await request<SaveResult>(`/products/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        if (res.status === 401 && res.code === "pin_required") requireSignIn();
        return res.message;
      }
      void refreshDetail(productId);
      return null;
    },
    [refreshDetail, request, requireSignIn]
  );

  const backToList = useCallback(() => {
    setDetail(null);
    setDetailError(null);
    setScreen("list");
    void loadList();
  }, [loadList]);

  // Bootstrap: partner + roster. Public, no PIN.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await request<Bootstrap>("");
      if (cancelled) return;
      if (!res.ok) {
        setBootstrapError(res.message);
        return;
      }
      setBootstrap(res.data);
      if (res.data.signedIn) {
        setScreen("list");
        void loadList();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, loadList]);

  if (bootstrapError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {bootstrapError}
        </p>
      </main>
    );
  }

  if (!bootstrap) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-neutral-600">Loading…</main>
    );
  }

  if (screen === "identify") {
    return (
      <IdentifyScreen
        bootstrap={bootstrap}
        onSignedIn={() => {
          setScreen("list");
          void loadList();
        }}
        request={request}
      />
    );
  }

  if (screen === "detail") {
    return (
      <DetailScreen
        detail={detail}
        error={detailError}
        loading={detailLoading}
        onBack={backToList}
        onSubmitAnswer={submitAnswer}
        onSubmitNote={submitNote}
      />
    );
  }

  return (
    <ListScreen
      data={list}
      error={listError}
      loading={listLoading}
      partnerName={bootstrap.partnerName}
      onOpen={openProduct}
      onRetry={() => void loadList()}
    />
  );
}

/* ------------------------------------------------------- screen: identify --- */

function IdentifyScreen({
  bootstrap,
  onSignedIn,
  request,
}: {
  bootstrap: Bootstrap;
  onSignedIn: () => void;
  request: <T,>(path: string, init?: RequestInit) => Promise<ApiResult<T>>;
}) {
  const reviewer = bootstrap.reviewer;
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function signIn() {
    setSubmitting(true);
    setError(null);
    // No employeeId: the link says who this is. Sending it would be the KEWL-2364 hole.
    const res = await request<SessionResult>("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.message);
      setPin("");
      return;
    }
    onSignedIn();
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <p className="text-sm text-neutral-500">{bootstrap.partnerName || "Staff review"}</p>
      <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Catalog review</h1>

      {reviewer.lockedOut ? (
        <section className="mt-6">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Too many PIN tries. Try again in a few minutes.
          </p>
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          <div>
            <h2 className="text-base font-medium text-neutral-800">
              {reviewer.hasPin
                ? `Hi ${reviewer.name} — enter your PIN`
                : `Hi ${reviewer.name} — pick a PIN`}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              {reviewer.hasPin
                ? "Four digits, so your reviews stay filed under your name."
                : "This link is yours. Choose 4 digits you'll remember — it keeps anyone else who gets the link out of your reviews. Pick something other than 1234."}
            </p>
          </div>

          <input
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            maxLength={4}
            type="password"
            placeholder="••••"
            aria-label="4-digit PIN"
            className="min-h-[56px] w-full rounded-lg border border-neutral-300 px-4 text-center text-3xl tracking-[0.5em]"
          />

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void signIn()}
            disabled={submitting || pin.length !== 4}
            className="min-h-[52px] w-full rounded-lg bg-neutral-950 px-4 text-base font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Checking…" : reviewer.hasPin ? "Start reviewing" : "Set PIN and start"}
          </button>
        </section>
      )}
    </main>
  );
}

/* ----------------------------------------------------------- screen: list --- */

function ListScreen({
  data,
  error,
  loading,
  partnerName,
  onOpen,
  onRetry,
}: {
  data: ListData | null;
  error: string | null;
  loading: boolean;
  partnerName: string;
  onOpen: (productId: string) => void;
  onRetry: () => void;
}) {
  const [onlyMine, setOnlyMine] = useState(false);
  const [showDone, setShowDone] = useState(false);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[48px] w-full rounded-lg border border-neutral-300 px-4 text-sm font-medium"
        >
          Try again
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-2xl p-6 text-sm text-neutral-600">Loading products…</main>
    );
  }

  const visible = onlyMine
    ? data.products.filter((product) => product.fieldsOwedByYou > 0)
    : data.products;

  return (
    <main className="mx-auto max-w-2xl p-4 pb-16 sm:p-6">
      <p className="text-sm text-neutral-500">{partnerName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Catalog review</h1>
      <p className="mt-1 text-sm text-neutral-600">Signed in as {data.reviewer.name}</p>

      <section className="mt-4 rounded-lg border border-neutral-200 p-4">
        <p className="text-lg font-semibold text-neutral-950">
          {data.coverage.fullyReviewed} of {data.coverage.total} fully reviewed
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          {data.coverage.owedByYou === 0
            ? "Nothing left for you right now."
            : `${data.coverage.owedByYou} still need something from you.`}
        </p>
      </section>

      <button
        type="button"
        onClick={() => setOnlyMine((value) => !value)}
        aria-pressed={onlyMine}
        className={`mt-3 min-h-[48px] w-full rounded-lg border px-4 text-sm font-medium ${
          onlyMine
            ? "border-neutral-950 bg-neutral-950 text-white"
            : "border-neutral-300 text-neutral-800"
        }`}
      >
        {onlyMine ? "Showing only what's left for me" : "Show only what's left for me"}
      </button>

      {loading ? <p className="mt-3 text-sm text-neutral-500">Refreshing…</p> : null}

      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-neutral-200 p-4 text-sm text-neutral-600">
          {onlyMine ? "You're all caught up." : "No products in this catalog yet."}
        </p>
      ) : null}

      {TIER_ORDER.map((tier) => {
        const group = visible.filter((product) => product.urgencyTier === tier);
        if (group.length === 0) return null;
        const collapsed = tier === 4 && !showDone;

        return (
          <section key={tier} className="mt-6">
            <div
              className={`rounded-t-lg border border-b-0 px-3 py-2 ${
                tier === 3
                  ? "border-red-300 bg-red-50"
                  : tier === 4
                    ? "border-neutral-200 bg-neutral-50"
                    : "border-neutral-300 bg-white"
              }`}
            >
              <h2
                className={`text-sm font-semibold ${
                  tier === 3 ? "text-red-800" : tier === 4 ? "text-neutral-500" : "text-neutral-900"
                }`}
              >
                {TIER_HEADINGS[tier]} ({group.length})
              </h2>
              <p
                className={`text-xs ${
                  tier === 3 ? "text-red-700" : tier === 4 ? "text-neutral-400" : "text-neutral-600"
                }`}
              >
                {TIER_BLURBS[tier]}
              </p>
              {tier === 4 ? (
                <button
                  type="button"
                  onClick={() => setShowDone((value) => !value)}
                  className="mt-1 min-h-[44px] text-xs font-medium text-neutral-600 underline"
                >
                  {showDone ? "Hide these" : "Show these"}
                </button>
              ) : null}
            </div>

            {collapsed ? null : (
              <ul
                className={`divide-y rounded-b-lg border ${
                  tier === 3
                    ? "divide-red-200 border-red-300"
                    : tier === 4
                      ? "divide-neutral-200 border-neutral-200"
                      : "divide-neutral-200 border-neutral-300"
                }`}
              >
                {group.map((product) => (
                  <li key={product.id}>
                    <ProductRow product={product} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}

function ProductRow({
  product,
  onOpen,
}: {
  product: ListProduct;
  onOpen: (productId: string) => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(product.photoUrl) && !photoFailed;

  return (
    <button
      type="button"
      onClick={() => onOpen(product.id)}
      className={`flex min-h-[76px] w-full items-center gap-3 px-3 py-3 text-left ${
        product.urgencyTier === 4 ? "opacity-70" : ""
      }`}
    >
      {showPhoto ? (
        // Plain img: these are partner-hosted URLs of unknown origin, not our optimized assets.
        <img
          src={product.photoUrl ?? ""}
          alt=""
          onError={() => setPhotoFailed(true)}
          className="h-14 w-14 shrink-0 rounded-md border border-neutral-200 object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-[10px] leading-tight text-neutral-400">
          No photo
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-neutral-950">
          {product.productName}
        </span>
        <span className="block truncate text-sm text-neutral-600">
          {product.brand || "Unknown brand"} · {product.format}
        </span>
        <span className="mt-1 block text-xs text-neutral-500">
          {product.verifiedFieldCount}/{product.reviewableFieldCount} fields verified
          {product.fieldsOwedByYou > 0 ? ` · ${product.fieldsOwedByYou} left for you` : ""}
        </span>

        {product.researchOnly ? (
          <span className="mt-1 inline-block rounded border border-purple-300 bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-800">
            Research only — never listed
          </span>
        ) : null}

        {product.disputedFields.length > 0 ? (
          <span className="mt-1 block rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-800">
            Disputed: {product.disputedFields.join(", ")}
          </span>
        ) : null}
      </span>

      <span aria-hidden className="shrink-0 text-neutral-400">
        ›
      </span>
    </button>
  );
}

/* --------------------------------------------------------- screen: detail --- */

function DetailScreen({
  detail,
  error,
  loading,
  onBack,
  onSubmitAnswer,
  onSubmitNote,
}: {
  detail: DetailData | null;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onSubmitAnswer: (productId: string, answer: AnswerPayload) => Promise<string | null>;
  onSubmitNote: (productId: string, note: string) => Promise<string | null>;
}) {
  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="min-h-[44px] text-sm font-medium text-neutral-700 underline"
    >
      ← All products
    </button>
  );

  if (error) {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6">
        {backLink}
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
      </main>
    );
  }

  if (loading || !detail) {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-4 sm:p-6">
        {backLink}
        <p className="text-sm text-neutral-600">Loading product…</p>
      </main>
    );
  }

  const photo = detail.product.photos.find((entry) => entry.isPrimary) ?? detail.product.photos[0];
  const photoCheck = detail.fields.find((field) => field.inputType === "photo_check");
  const rest = detail.fields.filter((field) => field.inputType !== "photo_check");

  return (
    <main className="mx-auto max-w-2xl p-4 pb-28 sm:p-6">
      {backLink}

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-neutral-950">{detail.product.productName}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {detail.product.brand || "Unknown brand"} · {detail.product.format}
          {detail.product.sku ? ` · ${detail.product.sku}` : ""}
        </p>
        {detail.product.researchOnly ? (
          <p className="mt-2 inline-block rounded border border-purple-300 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-800">
            Research only — never listed
          </p>
        ) : null}
      </header>

      <ProductPhoto url={photo?.url ?? null} alt={detail.product.productName} />

      {photoCheck ? (
        <PhotoCheckCard
          field={photoCheck}
          productId={detail.product.id}
          onSubmitAnswer={onSubmitAnswer}
        />
      ) : null}

      <section className="mt-4 space-y-3">
        {rest.map((field) => (
          <FieldCard
            key={field.fieldName}
            field={field}
            productId={detail.product.id}
            onSubmitAnswer={onSubmitAnswer}
          />
        ))}
      </section>

      <NotesSection
        productId={detail.product.id}
        notes={detail.notes}
        onSubmitNote={onSubmitNote}
      />

      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-900">What's blocking this listing</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {detail.gate.verifiedFieldCount} of {detail.gate.requiredFieldCount} required fields
          verified.
        </p>
        {detail.gate.blockers.length === 0 ? (
          <p className="mt-2 text-sm text-emerald-700">Nothing blocking it.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {detail.gate.blockers.map((blocker, index) => (
              <li key={`${blocker.kind}-${blocker.fieldName ?? index}`}>{blocker.label}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 p-3">
          <span
            className={`text-sm font-medium ${
              detail.gate.listable ? "text-emerald-700" : "text-neutral-700"
            }`}
          >
            {detail.gate.listable
              ? detail.gate.viaOverride
                ? "Listable (admin override)"
                : "Ready to list"
              : `Not listable — ${detail.gate.blockers.length} blocker${
                  detail.gate.blockers.length === 1 ? "" : "s"
                }`}
          </span>
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] shrink-0 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            Done
          </button>
        </div>
      </div>
    </main>
  );
}

function ProductPhoto({ url, alt }: { url: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="mt-4 flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500">
        No photo on file
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className="mt-4 aspect-square w-full rounded-lg border border-neutral-200 object-cover"
    />
  );
}

/* ------------------------------------------------------------ photo check --- */

function PhotoCheckCard({
  field,
  productId,
  onSubmitAnswer,
}: {
  field: DetailField;
  productId: string;
  onSubmitAnswer: (productId: string, answer: AnswerPayload) => Promise<string | null>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(action: ReviewAction, value?: string, key?: string) {
    setSaving(key ?? action);
    setError(null);
    setSaved(false);
    const message = await onSubmitAnswer(productId, {
      fieldName: field.fieldName,
      action,
      ...(value === undefined ? {} : { value }),
      ...(action === "dont_know" ? {} : { source: "personal-knowledge" as SourceValue }),
    });
    setSaving(null);
    if (message) {
      setError(message);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  const current = formatValue(field.currentValue);

  return (
    <section className="mt-4 rounded-lg border-2 border-neutral-950 p-4">
      <h2 className="text-base font-semibold text-neutral-950">{field.label}</h2>
      {field.helpText ? <p className="mt-1 text-sm text-neutral-600">{field.helpText}</p> : null}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "Yes", action: "fill" as ReviewAction, value: "yes", key: "yes" },
          { label: "No", action: "fill" as ReviewAction, value: "no", key: "no" },
          { label: "Not sure", action: "dont_know" as ReviewAction, value: undefined, key: "unsure" },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={saving !== null}
            onClick={() => void answer(option.action, option.value, option.key)}
            className="min-h-[52px] rounded-lg border border-neutral-300 px-2 text-base font-medium text-neutral-900 disabled:opacity-50"
          >
            {saving === option.key ? "…" : option.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {current ? `Answered so far: ${current}` : "Nobody has answered this yet"} ·{" "}
        {field.confirmationsCount}/{field.requiredConfirmations} confirmations
      </p>
      {saved ? <p className="mt-1 text-xs font-medium text-emerald-700">Saved</p> : null}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </section>
  );
}

/* ------------------------------------------------------------- field card --- */

function FieldCard({
  field,
  productId,
  onSubmitAnswer,
}: {
  field: DetailField;
  productId: string;
  onSubmitAnswer: (productId: string, answer: AnswerPayload) => Promise<string | null>;
}) {
  const [source, setSource] = useState<SourceValue>("packaging");
  const [editing, setEditing] = useState<"correct" | "fill" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = formatValue(field.currentValue);
  const filled = hasValue(field.currentValue);
  const yourAnswer = formatValue(field.yourAnswer);

  async function send(action: ReviewAction, value?: unknown) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const message = await onSubmitAnswer(productId, {
      fieldName: field.fieldName,
      action,
      ...(value === undefined ? {} : { value }),
      ...(action === "dont_know" ? {} : { source }),
    });
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setEditing(null);
    setDraft("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  const actionClass =
    "min-h-[48px] rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-900 disabled:opacity-50";

  return (
    <div
      className={`rounded-lg border p-4 ${
        field.state === "disputed" ? "border-red-400 bg-red-50/40" : "border-neutral-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-medium text-neutral-950">{field.label}</h3>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${FIELD_TIER_STYLES[field.tier]}`}
        >
          Tier {field.tier}
        </span>
      </div>

      {field.helpText ? <p className="mt-1 text-sm text-neutral-600">{field.helpText}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${fieldStateStyle(field.state)}`}
        >
          {FIELD_STATE_COPY[field.state]}
        </span>
        <span className="text-xs text-neutral-500">
          {field.confirmationsCount}/{field.requiredConfirmations} confirmations
        </span>
      </div>

      {/* Current value — empty is the normal state here, so say so plainly. */}
      <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        {current ? (
          <p className="text-sm font-medium break-words text-neutral-900">{current}</p>
        ) : (
          <p className="text-sm text-neutral-500">Not filled in yet</p>
        )}
      </div>

      {field.state === "disputed" && field.competingValues.length > 0 ? (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">
            People disagree here, and it's blocking this product from being listed.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {field.competingValues.map((value, index) => (
              <div
                key={index}
                className="rounded border border-red-300 bg-white p-2 text-sm break-words text-neutral-900"
              >
                {formatValue(value) ?? "(blank)"}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-red-700">Pick the right one below, or fill in the correct value.</p>
        </div>
      ) : null}

      {yourAnswer ? (
        <p className="mt-2 text-xs text-neutral-500">
          You said: {yourAnswer}. You can change it.
        </p>
      ) : null}

      {/* Source picker — required before anything but "I don't know" saves. */}
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-neutral-600">How do you know?</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {SOURCES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSource(option.value)}
              aria-pressed={source === option.value}
              className={`min-h-[44px] rounded-lg border px-2 text-sm ${
                source === option.value
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-300 text-neutral-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {editing ? (
        <div className="mt-3 space-y-2">
          {field.inputType === "number" ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="Enter a number"
              className="min-h-[48px] w-full rounded-lg border border-neutral-300 px-3 text-base"
            />
          ) : (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              type="text"
              placeholder={field.inputType === "list" ? "e.g. lemon, mint, pine" : "Type what it says"}
              className="min-h-[48px] w-full rounded-lg border border-neutral-300 px-3 text-base"
            />
          )}
          {field.inputType === "list" ? (
            <p className="text-xs text-neutral-500">Separate each one with a comma.</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || draft.trim().length === 0}
              onClick={() => void send(editing, draft)}
              className="min-h-[48px] rounded-lg bg-neutral-950 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setDraft("");
                setError(null);
              }}
              className={actionClass}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {filled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send("confirm")}
              className={actionClass}
            >
              Confirm
            </button>
          ) : null}
          {filled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing("correct");
                setDraft("");
                setError(null);
              }}
              className={actionClass}
            >
              Correct
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing("fill");
                setDraft("");
                setError(null);
              }}
              className={actionClass}
            >
              Fill in
            </button>
          )}
          {field.allowsConfirmedAbsent ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void send("confirmed_absent")}
              className={actionClass}
            >
              Not on the package
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void send("dont_know")}
            className={actionClass}
          >
            I don't know
          </button>
        </div>
      )}

      {saved ? <p className="mt-2 text-xs font-medium text-emerald-700">Saved</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- notes --- */

function NotesSection({
  productId,
  notes,
  onSubmitNote,
}: {
  productId: string;
  notes: { note: unknown; createdAt: string; byYou: boolean }[];
  onSubmitNote: (productId: string, note: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const message = await onSubmitNote(productId, text);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setDraft("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-4">
      <h2 className="text-base font-medium text-neutral-950">
        Anything else you know about this product?
      </h2>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Anything that doesn't fit a field above."
        className="mt-2 min-h-28 w-full rounded-lg border border-neutral-300 p-3 text-base"
      />
      <button
        type="button"
        disabled={busy || draft.trim().length === 0}
        onClick={() => void save()}
        className="mt-2 min-h-[48px] w-full rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save note"}
      </button>
      {saved ? <p className="mt-2 text-xs font-medium text-emerald-700">Saved</p> : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {notes.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {notes.map((entry, index) => (
            <li
              key={`${entry.createdAt}-${index}`}
              className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm break-words text-neutral-800"
            >
              {String(entry.note ?? "")}
              <span className="mt-1 block text-xs text-neutral-500">
                {entry.byYou ? "You" : "A teammate"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
