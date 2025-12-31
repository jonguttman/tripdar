module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/Tripd.ar/src/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/Tripd.ar/src/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/Tripd.ar/src/ui/api.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
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
}),
"[project]/Tripd.ar/src/ui/SignalCapture.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SignalCapture",
    ()=>SignalCapture,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
/**
 * Tripdar Signal Capture UI
 *
 * Minimal React UI that communicates with server APIs.
 *
 * Rules:
 * - Contains NO aggregation logic (server handles it)
 * - Contains NO signal storage (server handles it)
 * - Only renders questions, sends answers, displays language
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$api$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/src/ui/api.ts [app-rsc] (ecmascript)");
;
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
 * Direction labels for display.
 */ const DIRECTION_LABELS = {
    MORE: "More than usual",
    LESS: "Less than usual",
    SAME: "About the same",
    NOT_NOTICED: "Didn't notice"
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
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    children: dimensionId
                }, void 0, false, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 111,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 110,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: QUESTIONS[dimensionId]
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 113,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: DIRECTIONS.map((direction)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
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
                        children: DIRECTION_LABELS[direction]
                    }, direction, false, {
                        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                        lineNumber: 116,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 114,
                columnNumber: 7
            }, this),
            answered && !error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    color: "#888"
                },
                children: "✓ Signal recorded"
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 140,
                columnNumber: 9
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                style: {
                    color: "#c44"
                },
                children: error
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 142,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {
                style: {
                    margin: "16px 0",
                    borderColor: "#333"
                }
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 143,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
        lineNumber: 109,
        columnNumber: 5
    }, this);
}
function AggregationDisplay({ aggregations }) {
    const hasAny = DIMENSIONS.some((d)=>aggregations[d] !== null);
    if (!hasAny) {
        return null;
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            marginTop: 32,
            padding: 16,
            backgroundColor: "#111",
            border: "1px solid #333"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                    children: "Pattern Language"
                }, void 0, false, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 173,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 172,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("hr", {
                style: {
                    borderColor: "#333"
                }
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 175,
                columnNumber: 7
            }, this),
            DIMENSIONS.map((dimensionId)=>{
                const agg = aggregations[dimensionId];
                if (!agg) return null;
                // Render based on server response status
                if (agg.status === "PATTERN_DETECTED") {
                    // Render sentence verbatim
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        style: {
                            color: "#fff"
                        },
                        children: agg.sentence
                    }, dimensionId, false, {
                        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                        lineNumber: 184,
                        columnNumber: 13
                    }, this);
                }
                if (agg.status === "INSUFFICIENT_DATA") {
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                        lineNumber: 192,
                        columnNumber: 13
                    }, this);
                }
                if (agg.status === "NO_CLEAR_PATTERN") {
                    // Neutral placeholder - no pattern emerged
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
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
                        lineNumber: 201,
                        columnNumber: 13
                    }, this);
                }
                return null;
            })
        ]
    }, void 0, true, {
        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
        lineNumber: 164,
        columnNumber: 5
    }, this);
}
function SignalCapture() {
    // Track which dimensions have been answered and their selections
    const [answered, setAnswered] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["useState"])({
        clarity: false,
        calm: false,
        presence: false
    });
    const [selections, setSelections] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["useState"])({
        clarity: null,
        calm: null,
        presence: null
    });
    const [errors, setErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["useState"])({
        clarity: null,
        calm: null,
        presence: null
    });
    // Aggregation responses from server (per dimension)
    const [aggregations, setAggregations] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["useState"])({
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
        const signalResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$api$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["createSignal"])(input);
        if ("error" in signalResult) {
            // Show error verbatim
            setErrors((prev)=>({
                    ...prev,
                    [dimensionId]: signalResult.error
                }));
            return;
        }
        // On success, fetch aggregation for this dimension
        const aggResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$api$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getAggregation"])(dimensionId);
        setAggregations((prev)=>({
                ...prev,
                [dimensionId]: aggResult
            }));
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        style: {
            maxWidth: 600,
            margin: "0 auto",
            padding: 24,
            fontFamily: "system-ui"
        },
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                children: "Tripdar Signal Capture"
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 279,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                style: {
                    marginBottom: 24,
                    padding: 12,
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333"
                },
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    style: {
                        margin: 0,
                        color: "#888"
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                            children: "Context:"
                        }, void 0, false, {
                            fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                            lineNumber: 291,
                            columnNumber: 11
                        }, this),
                        " Golden Teacher at microdose"
                    ]
                }, void 0, true, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 290,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 282,
                columnNumber: 7
            }, this),
            DIMENSIONS.map((dimensionId)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(Question, {
                    dimensionId: dimensionId,
                    onAnswer: handleAnswer,
                    answered: answered[dimensionId],
                    selectedDirection: selections[dimensionId],
                    error: errors[dimensionId]
                }, dimensionId, false, {
                    fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                    lineNumber: 297,
                    columnNumber: 9
                }, this)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(AggregationDisplay, {
                aggregations: aggregations
            }, void 0, false, {
                fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
                lineNumber: 308,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Tripd.ar/src/ui/SignalCapture.tsx",
        lineNumber: 276,
        columnNumber: 5
    }, this);
}
const __TURBOPACK__default__export__ = SignalCapture;
}),
"[project]/Tripd.ar/src/app/share/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>SharePage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$SignalCapture$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Tripd.ar/src/ui/SignalCapture.tsx [app-rsc] (ecmascript)");
;
;
function SharePage() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Tripd$2e$ar$2f$src$2f$ui$2f$SignalCapture$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
        fileName: "[project]/Tripd.ar/src/app/share/page.tsx",
        lineNumber: 4,
        columnNumber: 10
    }, this);
}
}),
"[project]/Tripd.ar/src/app/share/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/Tripd.ar/src/app/share/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__3fd39e05._.js.map