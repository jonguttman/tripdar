"""Tripdar catalog-safe (Mode 1) product photo processing pipeline.

Deterministic, non-generative. Never calls an external API. Never repaints or
regenerates label pixels — label fidelity is guaranteed by construction.
"""

__version__ = "0.1.0"

# Processing modes
MODE_CATALOG_SAFE = "catalog_safe"
MODE_PREMIUM = "premium"  # Phase 2, generative — NOT implemented in this MVP.

# State machine states (manifest.status)
STATES = (
    "uploaded",
    "analyzing",
    "processing",
    "validating",
    "needs_review",
    "approved",
    "rejected",
    "failed",
)
