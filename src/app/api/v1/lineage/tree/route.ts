/**
 * Full Lineage Tree API
 *
 * GET /api/v1/lineage/tree
 *
 * Returns the complete lineage tree starting from root strains (wild types).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  addPartnerHeaders,
  withLogging,
} from "@/domain/partner";
import { buildFullTree, LineageTreeResponse } from "@/domain/lineage";
import type { ApiSuccessResponse } from "@/domain/partner";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { partner, context } = auth;

  return withLogging(context, "/api/v1/lineage/tree", async () => {
    const data = buildFullTree();

    const response = NextResponse.json<ApiSuccessResponse<LineageTreeResponse>>({
      success: true,
      data,
    });

    return addPartnerHeaders(response, partner, context);
  });
}
