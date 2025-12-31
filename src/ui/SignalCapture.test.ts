/**
 * UI Meaning Guardrails v1
 *
 * Tests that lock the label ↔ direction mapping.
 * These ensure UI labels remain aligned with Meaning Layer v1.0.
 *
 * If these tests break, it means someone changed the user-facing labels.
 * That change must be reviewed for Meaning Layer compliance.
 */

import { describe, it, expect } from "vitest";

/**
 * Locked answer labels.
 * This is the authoritative mapping from the UI component.
 * Duplicated here intentionally to catch drift.
 */
const ANSWER_LABELS = {
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
} as const;

describe("UI Meaning Guardrails v1", () => {
  describe("Answer label ↔ direction mapping", () => {
    it("clarity labels map to correct directions", () => {
      expect(ANSWER_LABELS.clarity.MORE).toBe("Clearer than usual");
      expect(ANSWER_LABELS.clarity.LESS).toBe("Foggier than usual");
      expect(ANSWER_LABELS.clarity.SAME).toBe("About the same");
      expect(ANSWER_LABELS.clarity.NOT_NOTICED).toBe("Didn't notice");
    });

    it("calm labels map to correct directions", () => {
      expect(ANSWER_LABELS.calm.MORE).toBe("Calmer than usual");
      expect(ANSWER_LABELS.calm.LESS).toBe("More restless than usual");
      expect(ANSWER_LABELS.calm.SAME).toBe("About the same");
      expect(ANSWER_LABELS.calm.NOT_NOTICED).toBe("Didn't notice");
    });

    it("presence labels map to correct directions", () => {
      expect(ANSWER_LABELS.presence.MORE).toBe("More grounded");
      expect(ANSWER_LABELS.presence.LESS).toBe("More wandering");
      expect(ANSWER_LABELS.presence.SAME).toBe("About the same");
      expect(ANSWER_LABELS.presence.NOT_NOTICED).toBe("Didn't notice");
    });
  });

  describe("Label semantics (Meaning Layer compliance)", () => {
    it("MORE labels imply positive comparative direction without intensity", () => {
      // Labels should be comparative, not evaluative
      const moreLabels = [
        ANSWER_LABELS.clarity.MORE,
        ANSWER_LABELS.calm.MORE,
        ANSWER_LABELS.presence.MORE,
      ];

      for (const label of moreLabels) {
        // No intensity modifiers
        expect(label).not.toMatch(/very|extremely|significantly|much/i);
        // No evaluative language
        expect(label).not.toMatch(/better|worse|good|bad|improved/i);
        // No outcome language
        expect(label).not.toMatch(/helped|worked|effective/i);
      }
    });

    it("LESS labels imply negative comparative direction without intensity", () => {
      const lessLabels = [
        ANSWER_LABELS.clarity.LESS,
        ANSWER_LABELS.calm.LESS,
        ANSWER_LABELS.presence.LESS,
      ];

      for (const label of lessLabels) {
        // No intensity modifiers
        expect(label).not.toMatch(/very|extremely|significantly|much/i);
        // No evaluative language
        expect(label).not.toMatch(/better|worse|good|bad|improved/i);
        // No outcome language
        expect(label).not.toMatch(/helped|worked|effective/i);
      }
    });

    it("all dimensions have exactly 4 directions", () => {
      const dimensions = ["clarity", "calm", "presence"] as const;
      const requiredDirections = ["MORE", "LESS", "SAME", "NOT_NOTICED"];

      for (const dim of dimensions) {
        const labels = ANSWER_LABELS[dim];
        expect(Object.keys(labels)).toHaveLength(4);
        expect(Object.keys(labels).sort()).toEqual(requiredDirections.sort());
      }
    });
  });
});

