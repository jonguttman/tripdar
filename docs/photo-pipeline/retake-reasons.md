# Retake-Reason Copy Library

*Psilly by Nature, Enchanted by Choice.*

When the quality stage can't safely repair an image, it surfaces a **retake reason** instead of silently failing. These are the approved strings.

**Voice rules for every retake message:**

- **Specific, not generic.** Name the exact problem — "the dosage text is cropped," never "the image failed."
- **Helpful, not scolding.** Tell the photographer what to do next, in one calm sentence.
- **Honest about the why.** When the fix protects label fidelity, say so — it's the point of the whole system.
- Never "Something went wrong." Never a bare error code with no human next step.

Each entry pairs a **customer/operator-facing message** with the checklist fix it points back to (see `photographer-checklist.md`). Use the message verbatim; the pipeline substitutes the bracketed detail (e.g. the specific edge or the detected text) where available.

---

## 1. Label cropped (edge clipping)

> **Retake needed —** the lower edge of the label is cut off, so the dosage text can't be verified. Reframe with the full container and a little space around every edge.

*Fix: keep the full cap and base in frame with breathing room on all sides.*

## 2. Cap or base cut off

> **Retake needed —** the top of the cap runs off the edge of the frame. Step back so the whole product, cap to base, sits inside the shot with room to spare.

*Fix: whole product in frame + margin.*

## 3. Out of focus / soft label

> **Retake needed —** the label is too soft to read cleanly. Set the phone on a tripod, tap the label to focus, and lock focus before you shoot.

*Fix: tripod + lock focus.*

## 4. Motion blur

> **Retake needed —** camera shake blurred this one. A tripod (or bracing the phone against something solid) will sharpen it right up.

*Fix: tripod.*

## 5. Glare over the label

> **Retake needed —** a bright reflection is sitting over the label and we can't clear it without touching the text. Move your light higher and off to the side, then reshoot.

*Fix: raise and angle the light to kill glare.*

## 6. Steep camera angle

> **Retake needed —** this was shot from too sharp an angle and the label is distorted. Aim straight on, from just above the middle of the container.

*Fix: shoot slightly above center, square to the product.*

## 7. Wide-angle distortion

> **Retake needed —** the lens was too close and bowed the container's edges. Step back and use optical zoom instead of getting in close.

*Fix: distance + optical zoom over wide-angle.*

## 8. Digital zoom / low detail

> **Retake needed —** this looks like digital zoom, and the fine print lost its detail. Move physically closer or use your phone's optical zoom — never the digital range.

*Fix: optical zoom only, never digital.*

## 9. Multiple products in frame

> **Retake needed —** there's more than one product in the shot. Photograph a single product on its own so we can center and process it cleanly.

*Fix: one product per photo.*

## 10. Obstruction over the product

> **Retake needed —** something is covering part of the product — a hand, a price tag, or a prop. Clear the frame so nothing overlaps the container.

*Fix: clear background, nothing touching the product.*

## 11. Resolution too low

> **Retake needed —** this image is below the resolution we need for a crisp catalog file. Shoot at your phone's highest resolution and turn off any zoom that crops detail.

*Fix: highest resolution setting.*

## 12. Underexposed / too dark

> **Retake needed —** the shot is too dark to read the label reliably. Add soft, even light and reshoot — bright and neutral beats dim every time.

*Fix: soft, even lighting; lock exposure on the label.*

## 13. Overexposed / blown highlights

> **Retake needed —** the whites are blown out and detail is lost in the bright areas. Soften or pull back your light, lock exposure on the label, and reshoot.

*Fix: control the light; lock exposure.*

## 14. Depth / portrait-mode blur

> **Retake needed —** portrait mode blurred the edges of the product, which breaks background removal. Turn off Portrait and any depth effect — the studio look is added for you later.

*Fix: Portrait / depth mode OFF.*

## 15. Dust or fingerprints on the label

> **Retake needed —** there's dust or a fingerprint across the label, and we can't clean over printed text. Wipe the container down and reshoot.

*Fix: clean the product before shooting.*

## 16. Label not facing the camera

> **Retake needed —** the front label is turned away from the camera. Rotate the product so the label faces straight into the lens.

*Fix: label centered and square to the camera.*

## 17. Product tilted / not upright

> **Retake needed —** the product is leaning too far to straighten safely. Stand it upright and level, then reshoot square to the camera.

*Fix: upright and level.*

---

## Fallback (use only when no specific reason is detected)

> **Retake needed —** we couldn't process this one safely. Check that the full product is in frame, sharp, evenly lit, and clean, then reshoot. See the photographer's checklist for a quick pass.

Reserve this for the rare case the quality stage flags an image it can't attribute to a specific mode. Prefer a specific reason above whenever one applies — a vague message wastes the photographer's next attempt.
