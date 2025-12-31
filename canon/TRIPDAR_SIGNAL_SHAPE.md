# Tripdar Signal Shape

## Purpose

This document defines the conceptual structure of a single Tripdar signal — the atomic unit of experiential data.

A signal is not a row in a database. It is a unit of meaning. This document formalizes what that unit contains, how it behaves, and where its boundaries are.

---

## What a Signal Is

A signal is a **single comparative observation** about one experiential dimension, anchored to a specific context.

A signal answers:

> "For this strain, at this dose, compared to [reference], this dimension felt [direction]."

That's all a signal is. Nothing more.

---

## Signal Anatomy

Every signal has exactly four components:

```
┌─────────────────────────────────────────────────────────┐
│                        SIGNAL                           │
├─────────────────────────────────────────────────────────┤
│  CONTEXT        │  Strain × Dose × Scale               │
│  DIMENSION      │  One of the 27 defined dimensions    │
│  REFERENCE      │  Baseline / Within-strain / Cross    │
│  DIRECTION      │  More / Less / Same / Not noticed    │
└─────────────────────────────────────────────────────────┘
```

### Component 1: Context

Context is the **what** and **how much**.

| Element | Cardinality | Optionality |
|---------|-------------|-------------|
| Strain | Exactly one | Required |
| Dose Category | Exactly one | Required |
| Scale | Exactly one (Micro / Macro) | Required |

**Constraints:**
- A signal cannot exist without context
- Context is immutable once recorded
- Context is not evaluative

---

### Component 2: Dimension

Dimension is the **which quality**.

| Element | Cardinality | Optionality |
|---------|-------------|-------------|
| Dimension | Exactly one | Required |

**Constraints:**
- A signal addresses exactly one dimension
- Dimension must be from the defined set of 27
- A signal cannot span multiple dimensions

*If a user's response touches multiple dimensions, it produces multiple signals.*

---

### Component 3: Reference

Reference is the **compared to what**.

| Element | Cardinality | Optionality |
|---------|-------------|-------------|
| Reference Frame | Exactly one | Required |

**Valid Reference Frames:**

| Frame | Meaning |
|-------|---------|
| **Baseline** | Compared to ordinary waking state |
| **Within-strain** | Compared to same strain at different dose |
| **Cross-strain** | Compared to different strain at similar dose |

**Constraints:**
- Every signal must have a reference
- Reference determines what the comparison means
- Signals with different references are not directly comparable

---

### Component 4: Direction

Direction is the **which way**.

| Element | Cardinality | Optionality |
|---------|-------------|-------------|
| Direction | Exactly one | Required |

**Valid Directions:**

| Direction | Meaning |
|-----------|---------|
| **More** | This dimension was more present than reference |
| **Less** | This dimension was less present than reference |
| **Same** | No noticeable difference from reference |
| **Not noticed** | Dimension was not salient; no observation |

**Constraints:**
- Direction is the only variable component of a signal
- Direction is never numeric
- "Not noticed" is a valid signal, not missing data

---

## Cardinality Rules

These rules define how many of each element can exist.

| Rule | Description |
|------|-------------|
| **One dimension per signal** | A signal is atomic to one dimension |
| **One reference per signal** | A signal uses one comparison frame |
| **One direction per signal** | A signal records one directional observation |
| **One context per signal** | A signal belongs to exactly one strain × dose × scale |

**Implication:** A complete report from one experience produces **multiple signals** — one per dimension observed.

---

## Optionality Rules

These rules define what must exist vs. what may be absent.

| Component | Optionality | Meaning |
|-----------|-------------|---------|
| Context | Required | No signal exists without strain × dose × scale |
| Dimension | Required | No signal exists without a dimension |
| Reference | Required | No signal exists without a comparison anchor |
| Direction | Required | No signal exists without an observation |

**There is no such thing as a partial signal.** If any component is missing, no signal is recorded.

**However:** A user is not required to produce signals for all dimensions. Unanswered questions produce no signal — they do not produce "null" signals.

---

## Repeatability Rules

These rules define how signals can recur.

### Same user, same context, same dimension

| Scenario | Allowed? | Handling |
|----------|----------|----------|
| Same user reports on same strain × dose × dimension again | Yes | Each report produces a new signal |
| Signals are averaged or merged | No | Signals remain discrete |
| User "updates" a previous signal | No | New signal is added; old signal remains |

**Signals are append-only.** They are never edited, merged, or replaced.

---

### Same user, different context

| Scenario | Allowed? | Handling |
|----------|----------|----------|
| Same user reports on same strain at different dose | Yes | Produces new signals with different context |
| Same user reports on different strain at same dose | Yes | Produces new signals with different context |

**Each context is independent.** Signals from different contexts are never combined at the signal level.

---

### Different users, same context

| Scenario | Allowed? | Handling |
|----------|----------|----------|
| Multiple users report on same strain × dose × dimension | Yes | Each produces independent signals |
| Signals are aggregated for pattern visibility | Yes — at aggregation layer only | See Aggregation Boundaries below |

---

## Aggregation Boundaries

Signals aggregate into patterns. But aggregation has strict boundaries.

### What can be aggregated

| Aggregation | Allowed | Example |
|-------------|---------|---------|
| Same strain × dose × dimension, across users | Yes | "This strain at microdose commonly shows more Clarity" |
| Same strain, across doses, same dimension | Yes | "This dimension tends to increase with dose for this strain" |
| Same dose category, across strains, same dimension | Yes | "At microdose, Strain A shows more Calm than Strain B" |

### What cannot be aggregated

| Aggregation | Forbidden | Reason |
|-------------|-----------|--------|
| Across dimensions | No | Dimensions are not reducible to each other |
| Into intensity scores | No | Direction is not magnitude |
| Into success/outcome | No | Signals are not outcomes |
| Across incompatible references | No | Baseline vs. cross-strain comparisons don't combine |

---

### Aggregation output

Aggregation produces **pattern language**, not numbers.

| Aggregation Type | Valid Output |
|------------------|--------------|
| Dimension frequency | "Commonly reported" / "Rarely reported" |
| Dimension direction | "Tends toward more" / "Tends toward less" |
| Comparative difference | "More often shows X than Y" |

| Aggregation Type | Invalid Output |
|------------------|----------------|
| Averages | "Average clarity score: 3.7" |
| Percentages | "73% report increased clarity" |
| Rankings | "#1 strain for focus" |

**Aggregation is descriptive, not evaluative.**

---

## Signal Boundaries

These define where a signal ends and other data begins.

### Signals vs. Stories

| Signals | Stories |
|---------|---------|
| Structured | Unstructured |
| Comparable | Irreducible |
| Aggregatable | Contextual |
| Anonymous in aggregate | Personal |

**A signal never contains narrative.** If a user provides open text, it is captured separately as story, not encoded into the signal.

---

### Signals vs. Outcomes

| Signals | Outcomes |
|---------|----------|
| Describe experience qualities | Describe results or effects |
| Comparative | Evaluative |
| In-the-moment | After-the-fact judgment |

**A signal never encodes whether something "worked."**

---

### Signals vs. Identity

| Signals | Identity |
|---------|----------|
| Context is strain × dose | Context is never user traits |
| Anonymous in aggregate | Never attributed to individuals |
| Pattern-building | Not profile-building |

**Signals are not user data.** They are experience data. Tripdar does not model users.

---

## Signal Lifecycle

A signal moves through these stages:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   CAPTURE    │ ──▶ │    STORE     │ ──▶ │  AGGREGATE   │
│              │     │              │     │              │
│ User answers │     │ Signal saved │     │ Patterns     │
│ question     │     │ as discrete  │     │ become       │
│              │     │ unit         │     │ visible      │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Capture:** A question is answered; a signal is produced.

**Store:** The signal is recorded as an immutable, discrete unit.

**Aggregate:** Signals with compatible context are compared to reveal patterns.

At no point is a signal edited, merged, scored, or reduced.

---

## Signal Validity Test

Before a signal is accepted, it must pass this test:

| Check | Question |
|-------|----------|
| Context complete? | Is strain × dose × scale present? |
| Dimension valid? | Is dimension from the defined set? |
| Reference valid? | Is reference one of the three frames? |
| Direction valid? | Is direction one of the four options? |
| Non-evaluative? | Does direction describe experience, not outcome? |

If any check fails, no signal is recorded.

---

## Example Signals

### Valid signal

```
Context:    Golden Teacher × Microdose × Micro
Dimension:  Clarity
Reference:  Baseline
Direction:  More
```

*"At microdose with Golden Teacher, clarity felt greater than usual."*

---

### Valid signal (absence)

```
Context:    Penis Envy × Moderate × Macro
Dimension:  Visual Nuance
Reference:  Baseline
Direction:  Not noticed
```

*"At moderate dose with Penis Envy, visual nuance was not salient."*

---

### Valid signal (within-strain comparison)

```
Context:    Golden Teacher × Moderate × Macro
Dimension:  Time Dilation
Reference:  Within-strain (compared to microdose)
Direction:  More
```

*"At moderate dose with Golden Teacher, time dilation was more present than at microdose."*

---

### Invalid signal (missing reference)

```
Context:    Golden Teacher × Microdose × Micro
Dimension:  Calm
Reference:  [missing]
Direction:  More
```

*No signal recorded — reference is required.*

---

### Invalid signal (evaluative direction)

```
Context:    Golden Teacher × Microdose × Micro
Dimension:  Significance
Reference:  Baseline
Direction:  "Very meaningful, changed my life"
```

*No signal recorded — this is outcome/story, not direction.*

---

*This document defines the shape of a Tripdar signal. It is a conceptual specification, not a data schema. Schema design follows once the signal shape is validated.*

---

## Watch Points (Governance Notes)

### ⚠️ Component Creep
Four components is the ceiling. Pressure will come to add metadata (timestamp, location, user segment). Resist. Context is strain × dose × scale. Nothing else.

### ⚠️ Direction Inflation
The four directions (More / Less / Same / Not noticed) are complete. Pressure will come to add gradations ("slightly more," "much more"). This reintroduces intensity. Refuse.

### ⚠️ Aggregation Drift
Aggregation produces language, not numbers. Any request to output percentages, averages, or rankings violates the model. Pattern language only.

### ⚠️ Signal-Story Bleed
Open text responses must never be encoded into signals. The moment narrative enters the signal, the signal becomes irreducible and non-comparable. Hard boundary.