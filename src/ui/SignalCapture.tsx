/**
 * Tripdar Signal Capture UI
 * 
 * Minimal React UI that consumes the domain layer.
 * 
 * Rules:
 * - Uses domain/index.ts exports only
 * - Contains NO validation logic (domain handles it)
 * - Contains NO aggregation language construction (domain handles it)
 * - Only renders questions, captures directions, calls store.append()
 */

import { useState, useMemo } from "react";
import {
  Dimension,
  Direction,
  SignalStore,
  createSignalStore,
  aggregateAll,
  FIXED_CONTEXT,
  VALID_DIMENSIONS,
  VALID_DIRECTIONS,
} from "../domain";

// =============================================================================
// QUESTION DEFINITIONS
// =============================================================================

/**
 * Question text for each dimension.
 * Per spec: questions are comparative, never ask "how much".
 */
const QUESTIONS: Record<Dimension, string> = {
  Clarity: "Compared to your usual state, did your thinking feel clearer or foggier?",
  Calm: "Did you feel calmer or more restless than usual?",
  Presence: "Did you feel more grounded in the moment, or was your mind more wandering?",
};

/**
 * Direction labels for display.
 */
const DIRECTION_LABELS: Record<Direction, string> = {
  More: "More than usual",
  Less: "Less than usual",
  Same: "About the same",
  "Not noticed": "Didn't notice",
};

// =============================================================================
// QUESTION COMPONENT
// =============================================================================

interface QuestionProps {
  dimension: Dimension;
  onAnswer: (dimension: Dimension, direction: Direction) => void;
  answered: boolean;
  selectedDirection: Direction | null;
}

function Question({ dimension, onAnswer, answered, selectedDirection }: QuestionProps) {
  return (
    <div>
      <p><strong>{dimension}</strong></p>
      <p>{QUESTIONS[dimension]}</p>
      <div>
        {VALID_DIRECTIONS.map((direction) => (
          <button
            key={direction}
            onClick={() => onAnswer(dimension, direction)}
            disabled={answered}
            style={{
              marginRight: 8,
              marginBottom: 8,
              padding: "8px 16px",
              backgroundColor: selectedDirection === direction ? "#444" : "#222",
              color: "#fff",
              border: selectedDirection === direction ? "2px solid #888" : "1px solid #444",
              cursor: answered ? "not-allowed" : "pointer",
              opacity: answered ? 0.6 : 1,
            }}
          >
            {DIRECTION_LABELS[direction]}
          </button>
        ))}
      </div>
      {answered && <p style={{ color: "#888" }}>✓ Signal recorded</p>}
      <hr style={{ margin: "16px 0", borderColor: "#333" }} />
    </div>
  );
}

// =============================================================================
// AGGREGATION DISPLAY COMPONENT
// =============================================================================

interface AggregationDisplayProps {
  signalCount: number;
  store: SignalStore;
}

function AggregationDisplay({ signalCount, store }: AggregationDisplayProps) {
  const signals = store.getAll();
  const aggregation = aggregateAll(signals);

  // Always show aggregation section when there are signals
  // This displays either pattern language or "not enough reports" per spec
  if (signalCount === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 32, padding: 16, backgroundColor: "#111", border: "1px solid #333" }}>
      <p><strong>Aggregation Output</strong></p>
      <p style={{ color: "#888" }}>
        {aggregation.strain} at {aggregation.dose.toLowerCase()} — {signals.length} signal(s)
      </p>
      <hr style={{ borderColor: "#333" }} />
      {aggregation.dimensions.map((dim) => (
        <p key={dim.dimension} style={{ color: dim.canSpeak ? "#fff" : "#666" }}>
          {dim.sentence}
        </p>
      ))}
      {aggregation.compositeSentence && (
        <>
          <hr style={{ borderColor: "#333" }} />
          <p><em>{aggregation.compositeSentence}</em></p>
        </>
      )}
    </div>
  );
}

// =============================================================================
// MAIN SIGNAL CAPTURE COMPONENT
// =============================================================================

export function SignalCapture() {
  // Create store once (persists across renders via useMemo)
  const store = useMemo(() => createSignalStore(), []);

  // Track which dimensions have been answered and their selections
  const [answered, setAnswered] = useState<Record<Dimension, boolean>>({
    Clarity: false,
    Calm: false,
    Presence: false,
  });
  const [selections, setSelections] = useState<Record<Dimension, Direction | null>>({
    Clarity: null,
    Calm: null,
    Presence: null,
  });

  // Track signal count to trigger re-renders for aggregation display
  const [signalCount, setSignalCount] = useState(0);

  const handleAnswer = (dimension: Dimension, direction: Direction) => {
    // Append signal to store (domain handles validation)
    const signal = store.append({ dimension, direction });

    if (signal) {
      // Mark as answered
      setAnswered((prev) => ({ ...prev, [dimension]: true }));
      setSelections((prev) => ({ ...prev, [dimension]: direction }));
      // Update signal count to trigger re-render of aggregation
      setSignalCount((n) => n + 1);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Tripdar Signal Capture</h1>
      
      {/* Fixed context display */}
      <div style={{ marginBottom: 24, padding: 12, backgroundColor: "#1a1a1a", border: "1px solid #333" }}>
        <p style={{ margin: 0, color: "#888" }}>
          <strong>Context:</strong> {FIXED_CONTEXT.strain} at {FIXED_CONTEXT.dose.toLowerCase()}
        </p>
      </div>

      {/* Questions */}
      {VALID_DIMENSIONS.map((dimension) => (
        <Question
          key={dimension}
          dimension={dimension}
          onAnswer={handleAnswer}
          answered={answered[dimension]}
          selectedDirection={selections[dimension]}
        />
      ))}

      {/* Aggregation output (rendered verbatim from domain) */}
      <AggregationDisplay signalCount={signalCount} store={store} />
    </div>
  );
}

export default SignalCapture;

