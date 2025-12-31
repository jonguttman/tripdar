export {
  ALLOWED_SIGNAL_FIELDS,
  DOSE_CATEGORIES,
  EXPERIENCE_SCALES,
  REFERENCE_FRAMES,
  DIRECTIONS,
  DIMENSION_IDS,
} from "./constants";

export type {
  DoseCategory,
  ExperienceScale,
  ReferenceFrame,
  Direction,
  DimensionId,
} from "./constants";

export type { SignalRecord, PrismaClientLike } from "./types";

export { SignalValidationError, SignalImmutabilityError } from "./errors";
export type { SignalValidationIssue, SignalValidationIssueKind } from "./errors";

export { validateCreateSignalInput } from "./validate";

export { createSignal, updateSignal, deleteSignal } from "./service";


