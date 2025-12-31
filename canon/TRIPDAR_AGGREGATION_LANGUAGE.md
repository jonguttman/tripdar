# Tripdar Aggregation Language

## Purpose

This document defines the exact vocabulary Tripdar uses to express patterns derived from aggregated signals.

Aggregation language is how Tripdar speaks. It transforms raw signals into human-readable descriptions of experiential differences — without numbers, rankings, or evaluative claims.

---

## Core Principle

**Tripdar speaks in patterns, not metrics.**

Every aggregation output must:
- Describe what is commonly observed
- Compare without ranking
- Inform without persuading
- Use frequency language, not magnitude language

---

## Aggregation Language Components

### Component 1: Frequency Terms

These terms describe how often a pattern appears in signals.

| Term | Meaning | Use When |
|------|---------|----------|
| **Commonly** | Appears in a clear majority of signals | Strong pattern |
| **Often** | Appears in many signals | Moderate pattern |
| **Sometimes** | Appears in some signals | Weak but present pattern |
| **Occasionally** | Appears in a minority of signals | Infrequent pattern |
| **Rarely** | Appears in very few signals | Near-absent pattern |

**Forbidden alternatives:**
- ❌ Percentages ("73% report...")
- ❌ Counts ("42 users said...")
- ❌ Majorities ("Most people...")
- ❌ Superlatives ("Almost everyone...")

---

### Component 2: Direction Terms

These terms describe which way a dimension tends to move.

| Term | Meaning | Derived From |
|------|---------|--------------|
| **More [dimension] than usual** | Direction: More, Reference: Baseline | Baseline comparison |
| **Less [dimension] than usual** | Direction: Less, Reference: Baseline | Baseline comparison |
| **Similar [dimension] to usual** | Direction: Same, Reference: Baseline | Baseline comparison |
| **Increased [dimension] compared to lower doses** | Direction: More, Reference: Within-strain | Dose comparison |
| **Decreased [dimension] compared to lower doses** | Direction: Less, Reference: Within-strain | Dose comparison |
| **More [dimension] than [other strain]** | Direction: More, Reference: Cross-strain | Strain comparison |
| **Less [dimension] than [other strain]** | Direction: Less, Reference: Cross-strain | Strain comparison |

**Forbidden alternatives:**
- ❌ Intensity modifiers ("much more," "significantly increased")
- ❌ Magnitude language ("strong," "powerful," "intense")
- ❌ Evaluative frames ("better," "improved," "enhanced")

---

### Component 3: Salience Terms

These terms describe which dimensions stand out in a pattern.

| Term | Meaning | Use When |
|------|---------|----------|
| **Notable for** | This dimension is frequently reported | High signal frequency for this dimension |
| **Characterized by** | This dimension defines the pattern | Dominant dimension in signals |
| **Tends toward** | This dimension leans in a direction | Consistent directional pattern |
| **May include** | This dimension sometimes appears | Present but not dominant |
| **Less associated with** | This dimension rarely appears | Low signal frequency |

---

### Component 4: Comparison Frames

These phrases anchor comparisons correctly.

| Frame | Template |
|-------|----------|
| **Baseline** | "Compared to ordinary experience..." |
| **Within-strain** | "Compared to lower doses of the same strain..." |
| **Cross-strain** | "Compared to [other strain] at similar doses..." |
| **General** | "Relative to other strains in this category..." |

---

## Aggregation Sentence Patterns

These are the exact sentence structures Tripdar uses.

### Pattern Type 1: Strain × Dose Description

Describes what is commonly reported for a specific strain at a specific dose.

**Template:**
> "[Strain] at [dose category] is [frequency term] described as [direction term] [dimension]."

**Examples:**
> "Golden Teacher at microdose is commonly described as more clarity than usual."

> "Penis Envy at moderate dose is often described as more time dilation than usual."

> "Blue Meanie at low dose is sometimes described as more body awareness than usual."

---

### Pattern Type 2: Dimension Salience

Describes which dimensions are most frequently reported for a strain × dose.

**Template:**
> "[Strain] at [dose category] is notable for [dimension list]."

**Examples:**
> "Golden Teacher at microdose is notable for clarity, presence, and calm."

> "Penis Envy at high dose is notable for time dilation, visual nuance, and significance."

---

### Pattern Type 3: Dose Shift

Describes how dimensions change when dose increases within the same strain.

**Template:**
> "When moving from [lower dose] to [higher dose] with [strain], [dimension] tends to [increase/decrease]."

**Examples:**
> "When moving from microdose to low dose with Golden Teacher, visual nuance tends to increase."

> "When moving from low dose to moderate dose with Penis Envy, calm tends to decrease."

---

### Pattern Type 4: Strain Comparison

Describes how two strains differ on a dimension at similar doses.

**Template:**
> "At [dose category], [Strain A] is [frequency term] described as [more/less] [dimension] than [Strain B]."

**Examples:**
> "At microdose, Golden Teacher is often described as more clarity than Blue Meanie."

> "At moderate dose, Penis Envy is commonly described as more time dilation than Golden Teacher."

---

### Pattern Type 5: Dimension Absence

Describes when a dimension is notably absent or unreported.

**Template:**
> "[Strain] at [dose category] is rarely associated with [dimension]."

**Examples:**
> "Golden Teacher at microdose is rarely associated with visual nuance."

> "Blue Meanie at low dose is rarely associated with time dilation."

---

### Pattern Type 6: Composite Profile

A multi-sentence description combining salience and direction for a strain × dose.

**Template:**
> "[Strain] at [dose category] is characterized by [primary dimensions]. Reports commonly describe [direction] [dimension] and [direction] [dimension]. [Dimension] is [frequency term] noted, while [dimension] is rarely reported."

**Example:**
> "Golden Teacher at microdose is characterized by cognitive and emotional dimensions. Reports commonly describe more clarity than usual and more calm than usual. Presence is often noted, while visual nuance is rarely reported."

---

## Forbidden Language

These phrases must never appear in Tripdar output.

### Evaluative Language

| Forbidden | Reason |
|-----------|--------|
| "Best for..." | Implies ranking and optimization |
| "Most effective..." | Implies outcome measurement |
| "Recommended for..." | Implies persuasion |
| "Ideal for..." | Implies prescription |
| "Superior..." | Implies hierarchy |

---

### Magnitude Language

| Forbidden | Reason |
|-----------|--------|
| "Very" | Reintroduces intensity |
| "Extremely" | Reintroduces intensity |
| "Strongly" | Reintroduces intensity |
| "Significantly" | Implies statistical weight |
| "Dramatically" | Reintroduces intensity |

---

### Numeric Language

| Forbidden | Reason |
|-----------|--------|
| "73% of users..." | Percentages are metrics |
| "3.7 out of 5..." | Scores are metrics |
| "42 reports..." | Counts expose sample size |
| "Most people..." | Implies counted majority |
| "The majority..." | Implies counted majority |

---

### Outcome Language

| Forbidden | Reason |
|-----------|--------|
| "Works for..." | Implies efficacy |
| "Helps with..." | Implies benefit |
| "Improves..." | Implies outcome |
| "Treats..." | Implies medical claim |
| "Cures..." | Implies medical claim |

---

## Aggregation Thresholds (Conceptual)

Tripdar uses thresholds to determine which frequency term applies. These are conceptual, not numeric.

| Frequency Term | Conceptual Threshold |
|----------------|----------------------|
| **Commonly** | Clear majority pattern; high confidence |
| **Often** | Strong presence; confident pattern |
| **Sometimes** | Present but not dominant |
| **Occasionally** | Minority pattern; low confidence |
| **Rarely** | Near-absent; very few signals |

**Implementation note:** Thresholds will be defined during schema design. They will be based on signal density, not fixed percentages, and will adapt to sample size.

---

## Minimum Signal Requirements

Tripdar does not speak about patterns until sufficient signals exist.

| Output Type | Minimum Requirement |
|-------------|---------------------|
| Strain × dose description | Enough signals to establish pattern confidence |
| Strain comparison | Sufficient signals for both strains at comparable doses |
| Dose shift description | Signals at both dose levels for the same strain |

**If minimum is not met:**
> "Not enough reports yet to describe patterns for [strain] at [dose]."

This is the only valid "insufficient data" message. It is not an apology; it is a boundary.

---

## Aggregation Scope Rules

These rules define what can and cannot be combined.

### Valid Aggregations

| Aggregation | Scope |
|-------------|-------|
| Same strain × same dose × same dimension | Core pattern unit |
| Same strain × across doses × same dimension | Dose shift pattern |
| Different strains × same dose × same dimension | Strain comparison |
| Same strain × same dose × multiple dimensions | Composite profile |

### Invalid Aggregations

| Aggregation | Reason |
|-------------|--------|
| Across dimensions into single score | Dimensions are not reducible |
| Across incompatible references | Baseline vs. cross-strain don't combine |
| Across all strains into "average" | Destroys comparative meaning |
| User-level patterns | Tripdar does not model users |

---

## Language Output Examples

### Example 1: Microdose Profile

**Context:** Golden Teacher × Microdose

**Aggregation output:**
> "Golden Teacher at microdose is characterized by cognitive and emotional dimensions. Reports commonly describe more clarity and more presence than usual. Calm and openness are often noted. Visual nuance and time dilation are rarely reported at this dose level."

---

### Example 2: Strain Comparison

**Context:** Golden Teacher vs. Penis Envy at Moderate Dose

**Aggregation output:**
> "At moderate dose, Golden Teacher is often described as more calm than Penis Envy. Penis Envy is commonly described as more time dilation and more visual nuance than Golden Teacher at this dose level. Both strains are notable for significance at moderate doses."

---

### Example 3: Dose Shift

**Context:** Golden Teacher, Microdose → Moderate

**Aggregation output:**
> "When moving from microdose to moderate dose with Golden Teacher, visual nuance tends to increase. Time dilation becomes more commonly reported. Clarity remains present but is sometimes described as shifting toward fluidity. Body awareness tends to increase."

---

### Example 4: Insufficient Data

**Context:** Newly added strain with few reports

**Aggregation output:**
> "Not enough reports yet to describe patterns for Albino A+ at microdose."

---

*This document defines the aggregation language Tripdar uses. It is a vocabulary specification, not an implementation. Output rendering follows once the language is validated.*

---

## Watch Points (Governance Notes)

### ⚠️ Frequency Term Drift
The five frequency terms (commonly, often, sometimes, occasionally, rarely) are complete. Pressure will come to add gradations ("very commonly," "almost never"). This reintroduces magnitude. Refuse.

### ⚠️ Comparative Creep
Comparison is between strains or doses, never between users, retailers, or sources. Any request to compare "who reports what" violates the model.

### ⚠️ Marketing Pressure
Requests will come to add phrases like "great for" or "popular choice." These are persuasive, not informational. The language must remain descriptive.

### ⚠️ Precision Theater
Requests will come to add confidence intervals, margins of error, or statistical significance. Tripdar is not a research tool. Pattern language is sufficient. Refuse.