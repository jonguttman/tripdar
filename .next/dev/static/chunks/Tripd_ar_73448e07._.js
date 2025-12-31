(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Tripd.ar/src/ui/api.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Tripdar API Client
 *
 * Minimal fetch layer for server communication.
 * No transformation, caching, or interpretation.
 * Returns raw JSON exactly as received.
 */ /**
 * Signal creation input.
 * All fields required per Meaning Layer v1.0.
 */ __turbopack_context__.s([
    "createSignal",
    ()=>createSignal,
    "getAggregation",
    ()=>getAggregation
]);
async function createSignal(input) {
    const res = await fetch("/api/signals", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
    });
    return res.json();
}
async function getAggregation(dimensionId) {
    const res = await fetch(`/api/aggregation?dimensionId=${encodeURIComponent(dimensionId)}`);
    return res.json();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Tripd.ar/src/ui/SignalCapture.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SignalCapture",
    ()=>SignalCapture,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
/**
 * Tripdar Signal Capture UI
 *
 * Minimal React UI that communicates with server APIs.
 *
 * Rules:
 * - Contains NO aggregation logic (server handles it)
 * - Contains NO signal storage (server handles it)
 * - Only renders questions, sends answers, displays language
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/src/ui/api.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
// =============================================================================
// FIXED CONTEXT (Meaning Layer v1.0)
// =============================================================================
/**
 * Fixed context for prototype phase.
 * Per implementation brief: one strain, one dose, baseline reference only.
 */ const FIXED_CONTEXT = {
    strainId: "golden-teacher",
    doseCategory: "MICRODOSE",
    scale: "MICRO",
    referenceFrame: "BASELINE"
};
// =============================================================================
// DIMENSION DEFINITIONS
// =============================================================================
/**
 * Valid dimensions for prototype.
 * Per implementation brief: three dimensions only.
 */ const DIMENSIONS = [
    "clarity",
    "calm",
    "presence"
];
/**
 * Valid directions.
 */ const DIRECTIONS = [
    "MORE",
    "LESS",
    "SAME",
    "NOT_NOTICED"
];
/**
 * Question text for each dimension.
 * Per spec: questions are comparative, never ask "how much".
 */ const QUESTIONS = {
    clarity: "Compared to your usual state, did your thinking feel clearer or foggier?",
    calm: "Did you feel calmer or more restless than usual?",
    presence: "Did you feel more grounded in the moment, or was your mind more wandering?"
};
/**
 * Dimension-specific answer labels.
 * Maps each dimension to human-readable labels per direction.
 * Submission still uses generic directions (MORE | LESS | SAME | NOT_NOTICED).
 */ const ANSWER_LABELS = {
    clarity: {
        MORE: "Clearer than usual",
        LESS: "Foggier than usual",
        SAME: "About the same",
        NOT_NOTICED: "Didn't notice"
    },
    calm: {
        MORE: "Calmer than usual",
        LESS: "More restless than usual",
        SAME: "About the same",
        NOT_NOTICED: "Didn't notice"
    },
    presence: {
        MORE: "More grounded",
        LESS: "More wandering",
        SAME: "About the same",
        NOT_NOTICED: "Didn't notice"
    }
};
// =============================================================================
// SESSION IDENTIFIERS
// =============================================================================
/**
 * Generate a simple unique ID for session/report grouping.
 */ function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
// Session and report IDs persist for the duration of this component instance
const sessionId = generateId();
const reportId = generateId();
function Question({ dimensionId, onAnswer, answered, selectedDirection, error }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    children: dimensionId
                }, void 0, false, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 132,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 131,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: QUESTIONS[dimensionId]
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 134,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: DIRECTIONS.map((direction)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>onAnswer(dimensionId, direction),
                        disabled: answered,
                        style: {
                            marginRight: 8,
                            marginBottom: 8,
                            padding: "8px 16px",
                            backgroundColor: selectedDirection === direction ? "#444" : "#222",
                            color: "#fff",
                            border: selectedDirection === direction ? "2px solid #888" : "1px solid #444",
                            cursor: answered ? "not-allowed" : "pointer",
                            opacity: answered ? 0.6 : 1
                        },
                        children: ANSWER_LABELS[dimensionId][direction]
                    }, direction, false, {
                        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                        lineNumber: 137,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 135,
                columnNumber: 7
            }, this),
            answered && !error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    color: "#888"
                },
                children: "✓ Signal recorded"
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 161,
                columnNumber: 9
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    color: "#c44"
                },
                children: error
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 163,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {
                style: {
                    margin: "16px 0",
                    borderColor: "#333"
                }
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 164,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
        lineNumber: 130,
        columnNumber: 5
    }, this);
}
_c = Question;
function AggregationDisplay({ aggregations }) {
    const hasAny = DIMENSIONS.some((d)=>aggregations[d] !== null);
    if (!hasAny) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            marginTop: 32,
            padding: 16,
            backgroundColor: "#111",
            border: "1px solid #333"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    children: "Pattern Language"
                }, void 0, false, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 194,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 193,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {
                style: {
                    borderColor: "#333"
                }
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 196,
                columnNumber: 7
            }, this),
            DIMENSIONS.map((dimensionId)=>{
                const agg = aggregations[dimensionId];
                if (!agg) return null;
                // Render based on server response status
                if (agg.status === "PATTERN_DETECTED") {
                    // Render sentence verbatim
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "#fff"
                        },
                        children: agg.sentence
                    }, dimensionId, false, {
                        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                        lineNumber: 205,
                        columnNumber: 13
                    }, this);
                }
                if (agg.status === "INSUFFICIENT_DATA") {
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "#666"
                        },
                        children: [
                            "Not enough reports yet for ",
                            dimensionId,
                            "."
                        ]
                    }, dimensionId, true, {
                        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                        lineNumber: 213,
                        columnNumber: 13
                    }, this);
                }
                if (agg.status === "NO_CLEAR_PATTERN") {
                    // Neutral placeholder - no pattern emerged
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "#666"
                        },
                        children: [
                            "No clear pattern for ",
                            dimensionId,
                            "."
                        ]
                    }, dimensionId, true, {
                        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                        lineNumber: 222,
                        columnNumber: 13
                    }, this);
                }
                return null;
            })
        ]
    }, void 0, true, {
        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
        lineNumber: 185,
        columnNumber: 5
    }, this);
}
_c1 = AggregationDisplay;
function SignalCapture() {
    _s();
    // Track which dimensions have been answered and their selections
    const [answered, setAnswered] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        clarity: false,
        calm: false,
        presence: false
    });
    const [selections, setSelections] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        clarity: null,
        calm: null,
        presence: null
    });
    const [errors, setErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        clarity: null,
        calm: null,
        presence: null
    });
    // Aggregation responses from server (per dimension)
    const [aggregations, setAggregations] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        clarity: null,
        calm: null,
        presence: null
    });
    const handleAnswer = async (dimensionId, direction)=>{
        // Mark as answered immediately (optimistic for UI)
        setAnswered((prev)=>({
                ...prev,
                [dimensionId]: true
            }));
        setSelections((prev)=>({
                ...prev,
                [dimensionId]: direction
            }));
        setErrors((prev)=>({
                ...prev,
                [dimensionId]: null
            }));
        // Build signal payload
        const input = {
            ...FIXED_CONTEXT,
            dimensionId,
            direction,
            sessionId,
            reportId
        };
        // POST signal to server
        const signalResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createSignal"])(input);
        if ("error" in signalResult) {
            // Show error verbatim
            setErrors((prev)=>({
                    ...prev,
                    [dimensionId]: signalResult.error
                }));
            return;
        }
        // On success, fetch aggregation for this dimension
        const aggResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$api$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getAggregation"])(dimensionId);
        setAggregations((prev)=>({
                ...prev,
                [dimensionId]: aggResult
            }));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: 600,
            margin: "0 auto",
            padding: 24,
            fontFamily: "system-ui"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                children: "Tripdar Signal Capture"
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 300,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginBottom: 24,
                    padding: 12,
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    style: {
                        margin: 0,
                        color: "#888"
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "Context:"
                        }, void 0, false, {
                            fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                            lineNumber: 312,
                            columnNumber: 11
                        }, this),
                        " Golden Teacher at microdose"
                    ]
                }, void 0, true, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 311,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 303,
                columnNumber: 7
            }, this),
            DIMENSIONS.map((dimensionId)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(Question, {
                    dimensionId: dimensionId,
                    onAnswer: handleAnswer,
                    answered: answered[dimensionId],
                    selectedDirection: selections[dimensionId],
                    error: errors[dimensionId]
                }, dimensionId, false, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 318,
                    columnNumber: 9
                }, this)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AggregationDisplay, {
                aggregations: aggregations
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 329,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
        lineNumber: 297,
        columnNumber: 5
    }, this);
}
_s(SignalCapture, "MVFa24rtkoCxMEJIHfwjUuVbCSo=");
_c2 = SignalCapture;
const __TURBOPACK__default__export__ = SignalCapture;
var _c, _c1, _c2;
__turbopack_context__.k.register(_c, "Question");
__turbopack_context__.k.register(_c1, "AggregationDisplay");
__turbopack_context__.k.register(_c2, "SignalCapture");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Tripd.ar/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
/**
 * @license React
 * react-jsx-dev-runtime.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ "use strict";
"production" !== ("TURBOPACK compile-time value", "development") && function() {
    function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch(type){
            case REACT_FRAGMENT_TYPE:
                return "Fragment";
            case REACT_PROFILER_TYPE:
                return "Profiler";
            case REACT_STRICT_MODE_TYPE:
                return "StrictMode";
            case REACT_SUSPENSE_TYPE:
                return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
                return "SuspenseList";
            case REACT_ACTIVITY_TYPE:
                return "Activity";
            case REACT_VIEW_TRANSITION_TYPE:
                return "ViewTransition";
        }
        if ("object" === typeof type) switch("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof){
            case REACT_PORTAL_TYPE:
                return "Portal";
            case REACT_CONTEXT_TYPE:
                return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
            case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                    return getComponentNameFromType(type(innerType));
                } catch (x) {}
        }
        return null;
    }
    function testStringCoercion(value) {
        return "" + value;
    }
    function checkKeyStringCoercion(value) {
        try {
            testStringCoercion(value);
            var JSCompiler_inline_result = !1;
        } catch (e) {
            JSCompiler_inline_result = !0;
        }
        if (JSCompiler_inline_result) {
            JSCompiler_inline_result = console;
            var JSCompiler_temp_const = JSCompiler_inline_result.error;
            var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
            return testStringCoercion(value);
        }
    }
    function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
        try {
            var name = getComponentNameFromType(type);
            return name ? "<" + name + ">" : "<...>";
        } catch (x) {
            return "<...>";
        }
    }
    function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
    }
    function UnknownOwner() {
        return Error("react-stack-top-frame");
    }
    function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
            var getter = Object.getOwnPropertyDescriptor(config, "key").get;
            if (getter && getter.isReactWarning) return !1;
        }
        return void 0 !== config.key;
    }
    function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
            specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
        }
        warnAboutAccessingKey.isReactWarning = !0;
        Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: !0
        });
    }
    function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
    }
    function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: type,
            key: key,
            props: props,
            _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
            enumerable: !1,
            get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", {
            enumerable: !1,
            value: null
        });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: null
        });
        Object.defineProperty(type, "_debugStack", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
    }
    function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children) if (isStaticChildren) if (isArrayImpl(children)) {
            for(isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)validateChildKeys(children[isStaticChildren]);
            Object.freeze && Object.freeze(children);
        } else console.error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
        else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
            children = getComponentNameFromType(type);
            var keys = Object.keys(config).filter(function(k) {
                return "key" !== k;
            });
            isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
            didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error('A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />', isStaticChildren, children, keys, children), didWarnAboutKeySpread[children + isStaticChildren] = !0);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
            maybeKey = {};
            for(var propName in config)"key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(maybeKey, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
        return ReactElement(type, children, maybeKey, getOwner(), debugStack, debugTask);
    }
    function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
    }
    function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    var React = __turbopack_context__.r("[project]/Tripd.ar/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)"), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
    };
    React = {
        react_stack_bottom_frame: function(callStackForError) {
            return callStackForError();
        }
    };
    var specialPropKeyWarningShown;
    var didWarnAboutElementRef = {};
    var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(React, UnknownOwner)();
    var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
    var didWarnAboutKeySpread = {};
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsxDEV = function(type, config, maybeKey, isStaticChildren) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        if (trackActualOwner) {
            var previousStackTraceLimit = Error.stackTraceLimit;
            Error.stackTraceLimit = 10;
            var debugStackDEV = Error("react-stack-top-frame");
            Error.stackTraceLimit = previousStackTraceLimit;
        } else debugStackDEV = unknownOwnerDebugStack;
        return jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStackDEV, trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
    };
}();
}),
"[project]/Tripd.ar/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
'use strict';
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
else {
    module.exports = __turbopack_context__.r("[project]/Tripd.ar/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)");
}
}),
]);

//# sourceMappingURL=Tripd_ar_73448e07._.js.map