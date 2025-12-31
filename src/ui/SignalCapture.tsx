"use client";

/**
 * Tripdar Signal Capture UI
 *
 * Minimal React UI that communicates with server APIs.
 *
 * Rules:
 * - Contains NO aggregation logic (server handles it)
 * - Contains NO signal storage (server handles it)
 * - Only renders questions, sends answers, displays language
 */

import { useState } from "react";
import {
  createSignal,
  getAggregation,
  type SignalInput,
  type AggregationResponse,
} from "./api";

// =============================================================================
// FIXED CONTEXT (Meaning Layer v1.0)
// =============================================================================

/**
 * Fixed context for prototype phase.
 * Per implementation brief: one strain, one dose, baseline reference only.
 */
const FIXED_CONTEXT = {
  strainId: "golden-teacher",
  doseCategory: "MICRODOSE",
  scale: "MICRO",
  referenceFrame: "BASELINE",
} as const;

// =============================================================================
// DIMENSION DEFINITIONS
// =============================================================================

/**
 * Valid dimensions for prototype.
 * Per implementation brief: three dimensions only.
 */
const DIMENSIONS = ["clarity", "calm", "presence"] as const;
type DimensionId = (typeof DIMENSIONS)[number];

/**
 * Valid directions.
 */
const DIRECTIONS = ["MORE", "LESS", "SAME", "NOT_NOTICED"] as const;
type Direction = (typeof DIRECTIONS)[number];

/**
 * Question text for each dimension.
 * Per spec: questions are comparative, never ask "how much".
 */
const QUESTIONS: Record<DimensionId, string> = {
  clarity:
    "Compared to your usual state, did your thinking feel clearer or foggier?",
  calm: "Did you feel calmer or more restless than usual?",
  presence:
    "Did you feel more grounded in the moment, or was your mind more wandering?",
};

/**
 * Dimension-specific answer labels.
 * Maps each dimension to human-readable labels per direction.
 * Submission still uses generic directions (MORE | LESS | SAME | NOT_NOTICED).
 */
const ANSWER_LABELS: Record<
  DimensionId,
  Record<Direction, string>
> = {
  clarity: {
    MORE: "Clearer than usual",
    LESS: "Foggier than usual",
    SAME: "About the same",
    NOT_NOTICED: "Didn't notice",
  },
  calm: {
    MORE: "Calmer than usual",
    LESS: "More restless than usual",
    SAME: "About the same",
    NOT_NOTICED: "Didn't notice",
  },
  presence: {
    MORE: "More grounded",
    LESS: "More wandering",
    SAME: "About the same",
    NOT_NOTICED: "Didn't notice",
  },
};

// =============================================================================
// SESSION IDENTIFIERS
// =============================================================================

/**
 * Generate a simple unique ID for session/report grouping.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Session and report IDs persist for the duration of this component instance
const sessionId = generateId();
const reportId = generateId();

// =============================================================================
// QUESTION COMPONENT
// =============================================================================

interface QuestionProps {
  dimensionId: DimensionId;
  onAnswer: (dimensionId: DimensionId, direction: Direction) => void;
  answered: boolean;
  selectedDirection: Direction | null;
  error: string | null;
}

function Question({
  dimensionId,
  onAnswer,
  answered,
  selectedDirection,
  error,
}: QuestionProps) {
  return (
    <div>
      <p>
        <strong>{dimensionId}</strong>
      </p>
      <p>{QUESTIONS[dimensionId]}</p>
      <div>
        {DIRECTIONS.map((direction) => (
          <button
            key={direction}
            onClick={() => onAnswer(dimensionId, direction)}
            disabled={answered}
            style={{
              marginRight: 8,
              marginBottom: 8,
              padding: "8px 16px",
              backgroundColor:
                selectedDirection === direction ? "#444" : "#222",
              color: "#fff",
              border:
                selectedDirection === direction
                  ? "2px solid #888"
                  : "1px solid #444",
              cursor: answered ? "not-allowed" : "pointer",
              opacity: answered ? 0.6 : 1,
            }}
          >
            {ANSWER_LABELS[dimensionId][direction]}
          </button>
        ))}
      </div>
      {answered && !error && (
        <p style={{ color: "#888" }}>✓ Signal recorded</p>
      )}
      {error && <p style={{ color: "#c44" }}>{error}</p>}
      <hr style={{ margin: "16px 0", borderColor: "#333" }} />
    </div>
  );
}

// =============================================================================
// AGGREGATION DISPLAY COMPONENT
// =============================================================================

interface AggregationDisplayProps {
  aggregations: Record<DimensionId, AggregationResponse | null>;
}

function AggregationDisplay({ aggregations }: AggregationDisplayProps) {
  const hasAny = DIMENSIONS.some((d) => aggregations[d] !== null);

  if (!hasAny) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: 32,
        padding: 16,
        backgroundColor: "#111",
        border: "1px solid #333",
      }}
    >
      <p>
        <strong>Pattern Language</strong>
      </p>
      <hr style={{ borderColor: "#333" }} />
      {DIMENSIONS.map((dimensionId) => {
        const agg = aggregations[dimensionId];
        if (!agg) return null;

        // Render based on server response status
        if (agg.status === "PATTERN_DETECTED") {
          // Render sentence verbatim
          return (
            <p key={dimensionId} style={{ color: "#fff" }}>
              {agg.sentence}
            </p>
          );
        }

        if (agg.status === "INSUFFICIENT_DATA") {
          return (
            <p key={dimensionId} style={{ color: "#666" }}>
              Not enough reports yet for {dimensionId}.
            </p>
          );
        }

        if (agg.status === "NO_CLEAR_PATTERN") {
          // Neutral placeholder - no pattern emerged
          return (
            <p key={dimensionId} style={{ color: "#666" }}>
              No clear pattern for {dimensionId}.
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}

// =============================================================================
// MAIN SIGNAL CAPTURE COMPONENT
// =============================================================================

export function SignalCapture() {
  // Track which dimensions have been answered and their selections
  const [answered, setAnswered] = useState<Record<DimensionId, boolean>>({
    clarity: false,
    calm: false,
    presence: false,
  });
  const [selections, setSelections] = useState<
    Record<DimensionId, Direction | null>
  >({
    clarity: null,
    calm: null,
    presence: null,
  });
  const [errors, setErrors] = useState<Record<DimensionId, string | null>>({
    clarity: null,
    calm: null,
    presence: null,
  });

  // Aggregation responses from server (per dimension)
  const [aggregations, setAggregations] = useState<
    Record<DimensionId, AggregationResponse | null>
  >({
    clarity: null,
    calm: null,
    presence: null,
  });

  const handleAnswer = async (dimensionId: DimensionId, direction: Direction) => {
    // Mark as answered immediately (optimistic for UI)
    setAnswered((prev) => ({ ...prev, [dimensionId]: true }));
    setSelections((prev) => ({ ...prev, [dimensionId]: direction }));
    setErrors((prev) => ({ ...prev, [dimensionId]: null }));

    // Build signal payload
    const input: SignalInput = {
      ...FIXED_CONTEXT,
      dimensionId,
      direction,
      sessionId,
      reportId,
    };

    // POST signal to server
    const signalResult = await createSignal(input);

    if ("error" in signalResult) {
      // Show error verbatim
      setErrors((prev) => ({ ...prev, [dimensionId]: signalResult.error }));
      return;
    }

    // On success, fetch aggregation for this dimension
    const aggResult = await getAggregation(dimensionId);
    setAggregations((prev) => ({ ...prev, [dimensionId]: aggResult }));
  };

  return (
    <div
      style={{ maxWidth: 600, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}
    >
      <h1>Tripdar Signal Capture</h1>

      {/* Fixed context display */}
      <div
        style={{
          marginBottom: 24,
          padding: 12,
          backgroundColor: "#1a1a1a",
          border: "1px solid #333",
        }}
      >
        <p style={{ margin: 0, color: "#888" }}>
          <strong>Context:</strong> Golden Teacher at microdose
        </p>
      </div>

      {/* Questions */}
      {DIMENSIONS.map((dimensionId) => (
        <Question
          key={dimensionId}
          dimensionId={dimensionId}
          onAnswer={handleAnswer}
          answered={answered[dimensionId]}
          selectedDirection={selections[dimensionId]}
          error={errors[dimensionId]}
        />
      ))}

      {/* Aggregation output (rendered verbatim from server) */}
      <AggregationDisplay aggregations={aggregations} />
    </div>
  );
}

export default SignalCapture;
