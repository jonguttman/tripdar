# Tripdar Signal Model

## Conceptual Definition

**Purpose:** Tripdar models patterns of reported experience — not outcomes, promises, or performance.

**Core Function:** Inform customers and visitors about the expected experience and benefits of psychedelic experiences, with a focus on the difference by strain and dose.

---

## Foundational Principles

### What Tripdar Models

Tripdar models **expectation**, not guarantee.  
Tripdar models **differences**, not rankings.  
Tripdar models **experience qualities**, not success.  
Tripdar models **strain × dose context**, not user identity.

---

## The Three Validity Tests

Every data point in Tripdar must pass all three tests. If it fails any one, it does not belong in the model.

### Test A — Experiential, Not Evaluative

**Allowed:**
- Commonly reported qualities
- Frequently described effects
- Typical experiential themes

**Not Allowed:**
- Best
- Strongest
- Most effective
- Highest rated

### Test B — Comparative, Not Absolute

**Allowed:**
- Differences between strains
- Differences between doses of the same strain
- Differences between macro and micro experiences

**Not Allowed:**
- Absolute scores
- Universal claims
- Single-axis intensity scales

### Test C — Informational, Not Persuasive

**Allowed:**
- Orientation
- Pattern recognition
- Vocabulary-building
- Expectation-setting

**Not Allowed:**
- Calls to action
- Claims of benefit certainty
- Optimization framing ("choose this for X")

---

## Hard Exclusions

Tripdar must never encode the following. These are non-negotiable boundaries.

### Personal Outcomes
- No "worked for me"
- No success/failure framing
- No therapeutic claims

*These belong in stories, not signals.*

### Engagement or Behavior
- No dwell time
- No completion metrics
- No frequency of use

*These distort experience data.*

### Retailer Performance
- No "most reported at X store"
- No comparisons between retailers
- No implied sourcing quality

*Retailers participate, but are not evaluated.*

### Intensity as a Scalar

"Intensity" is forbidden as a single metric because it collapses:
- Duration
- Emotional depth
- Cognitive alteration
- Somatic sensation

...into a single misleading number.

**Tripdar decomposes experience. It does not compress it.**

---

## Core Primitives

These are the conceptual building blocks of the Tripdar data model. They define meaning, not structure.

### Primitive 1: Context

Context answers:
- Which strain?
- Which dose category?
- Which experience scale (macro vs micro)?

Context is **descriptive**, not evaluative.

### Primitive 2: Experiential Dimensions

These are qualitative axes — not scores, not ratings.

Illustrative examples (not exhaustive):
- **Cognitive tone:** clarity, fluidity, introspection
- **Emotional texture:** openness, calm, sensitivity
- **Somatic presence:** body awareness, energy
- **Perceptual shift:** visual nuance, sensory enhancement
- **Temporal feel:** time dilation, flow

Key constraints:
- These are dimensions, not ratings
- Users do not "rate" them
- They describe *how experiences differ*, not *how good they are*

### Primitive 3: Comparative Expression

Instead of asking "How intense was it?", Tripdar asks:
- "Compared to other experiences, did this feel more or less [dimension]?"
- "Compared to a lower dose of the same strain, what changed?"
- "Compared to macro experiences, how did this microdose differ?"

**Comparison is always relative, never absolute.**

### Primitive 4: Aggregation Without Scoring

Tripdar's power comes from **pattern visibility**, not numbers.

Valid aggregation language:
- "This strain at microdose levels is commonly described as..."
- "At higher doses, reports tend to shift toward..."
- "Compared to Strain A, Strain B more often emphasizes..."

Constraints:
- No percentages
- No averages
- No rankings
- Language-first aggregation only

### Primitive 5: Separation of Signals and Stories

**Signals** are:
- Structured
- Comparable
- Aggregatable

**Stories** are:
- Expressive
- Contextual
- Irreducible

The data model must never require stories to exist.  
Signals must never depend on stories.  
They are fundamentally separate.

---

## Meaning Constraints Summary

| Category | Allowed | Forbidden |
|----------|---------|-----------|
| Tone | Experiential description | Evaluative judgment |
| Scale | Relative comparison | Absolute measurement |
| Purpose | Inform and orient | Persuade or optimize |
| Source | Aggregated patterns | Individual outcomes |
| Expression | Dimensional qualities | Scalar intensity |
| Separation | Signals independent | Signals dependent on stories |

---

## Design Process (For Future Schema Work)

When ready to move from meaning to structure, follow this sequence:

1. **Write the questions, not the fields** — If a question feels like marketing or evaluation, discard it.

2. **Identify minimum observable answers** — For each question, determine the least structured input needed to answer it honestly.

3. **Define allowed comparisons explicitly** — Document what comparisons are valid and what comparisons are forbidden.

4. **Only then design structure** — Once meaning is locked, define entities, relationships, and required vs optional data.

---

*This document defines intent and constraint. It is not a schema. Schema design begins only after this meaning layer is validated.*