# Tripdar — Conceptual Architecture

This document defines the canonical, technology-agnostic
conceptual architecture for Tripdar.

All implementation decisions must conform to this structure.
Source Observation
Tripdar observes ops.originalpsilly.com as the single authoritative source for production and signal context. It reads observational signals in real time without storing or modifying them. This layer maintains read-only access to the source.
Separate Presentation
Signals (Tripdar) and stories (Triptales) are presented separately. They never influence each other's data. Presentation preserves the distinction between observational signals and narrative stories.
Comparative Processing
Enables comparison across experiences at macro and microdose scales. Operates on observed data without creating metrics, scores, or rankings. Generates comparative views that support reflection.
Reflection Interface
The space where users engage reflectively with presented signals and stories. Supports both macro descriptive reflection and microdose reflective comparison. Prioritizes clarity over engagement metrics.
Experience Orchestration
Coordinates user flow between macro and microdose experiences and between signals and stories. Orchestrates presentation and navigation only; it does not allow data to flow between signals and stories.
Interpretation Services
Value-added services that can be monetized. These provide interpretation, tools, or aggregation of observed signals and stories. Raw signals and stories remain free; only interpretation, tools, and aggregation are monetized.
Constitutional Compliance
Enforces all constitutional boundaries. Prevents gamification, retailer metrics, pay-to-visibility, and collapsing of signals with stories. Acts as the final gatekeeper ensuring no non-compliant features reach users.