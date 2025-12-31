# Signal Table Definition (Meaning Layer v1.0)

A Signal is the atomic, immutable unit of Tripdar experience data.

---

## Required Fields

A Signal record contains exactly the following fields:

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier |
| `strainId` | Which strain (context) |
| `doseCategory` | Which dose level: MICRODOSE, LOW, MODERATE, HIGH (context) |
| `scale` | Which experience type: MICRO, MACRO (context) |
| `dimensionId` | Which experiential dimension (one of 27) |
| `referenceFrame` | What comparison anchor: BASELINE, WITHIN_STRAIN, CROSS_STRAIN |
| `comparisonDose` | For WITHIN_STRAIN only: which dose being compared against |
| `comparisonStrainId` | For CROSS_STRAIN only: which strain being compared against |
| `direction` | The observation: MORE, LESS, SAME, NOT_NOTICED |
| `sessionId` | Anonymous session identifier (for deduplication, not identity) |
| `reportId` | Groups signals from one submission (for provenance, not coupling) |
| `createdAt` | When the signal was recorded |

---

## Forbidden Fields

The following fields must never be added to a Signal:

| Forbidden | Reason |
|-----------|--------|
| `userId` | Tripdar does not model users |
| `intensity` | Direction is not magnitude |
| `strength` | Direction is not magnitude |
| `score` | Signals are not ratings |
| `effectiveness` | Signals are not outcomes |
| `outcome` | Signals are not outcomes |
| `success` | Signals are not outcomes |
| `duration` | Not part of signal shape |
| `dosageAmount` | Dose is categorical, not numeric |
| `timeSpent` | Engagement metrics distort experience data |
| `notes` | Narrative belongs in Story, not Signal |
| `storyText` | Narrative belongs in Story, not Signal |
| `confidence` | Signals are observations, not assessments |
| `aggregationResult` | Aggregation is computed, not stored |
| `rating` | Signals are not evaluative |
| `recommendation` | Signals are not persuasive |

---

## Immutability Rules

- Signals are **append-only**
- Signals must **never be updated**
- Signals must **never be deleted**
- Each signal stands alone

---

## Conditional Field Rules

| Condition | Requirement |
|-----------|-------------|
| If `referenceFrame` = WITHIN_STRAIN | `comparisonDose` is required and must differ from `doseCategory` |
| If `referenceFrame` = CROSS_STRAIN | `comparisonStrainId` is required and must differ from `strainId` |
| If `referenceFrame` = BASELINE | `comparisonDose` and `comparisonStrainId` must be null |

---

## What This Definition Does

This document pins the Signal shape to the ground.

It prevents:
- Cursor from "helpfully" adding fields
- Future-you from scope creep
- Drift between meaning and storage

If a field is not listed here, it does not belong on a Signal.

---

*Meaning Layer v1.0 — This definition is frozen. Changes require a new version.*
