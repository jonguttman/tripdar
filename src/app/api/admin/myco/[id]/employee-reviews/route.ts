import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import {
  aggregateEmployeeGuidance,
  createReviewToken,
  effectiveAssignmentStatus,
  hashReviewToken,
  normalizeEmployeeEmail,
  summarizeAssignments,
} from "@/domain/myco/employeeReviews";
import { buildRevokedTokenPatch, hashCatalogAccessToken } from "@/domain/myco/catalogTokens";

async function requireAuth() {
  const session = await getAdminSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }
  return session;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function reviewUrl(request: NextRequest, token: string): string {
  const configured = process.env.NEXTAUTH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = configured ? (configured.startsWith("http") ? configured : `https://${configured}`) : request.nextUrl.origin;
  return `${base.replace(/\/$/, "")}/review/myco/${token}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const access = await resolveProductForAdmin(auth.user!.email!, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const assignments = await prisma.mycoEmployeeReviewAssignment.findMany({
      where: { catalogItemId: id },
      include: {
        employee: { select: { id: true, name: true, email: true, points: true, streak: true, optedOut: true } },
        response: true,
      },
      orderBy: [{ assignedAt: "desc" }],
    });

    const now = new Date();
    const normalized = assignments.map((assignment) => ({
      id: assignment.id,
      employee: assignment.employee,
      status: effectiveAssignmentStatus(assignment.status, assignment.expiresAt, now),
      assignedAt: assignment.assignedAt,
      openedAt: assignment.openedAt,
      submittedAt: assignment.submittedAt,
      expiresAt: assignment.expiresAt,
      reminderCount: assignment.reminderCount,
      response: assignment.response,
    }));
    const guidance = aggregateEmployeeGuidance(
      assignments.flatMap((assignment) => (assignment.response ? [assignment.response] : []))
    );

    return NextResponse.json({
      success: true,
      data: {
        assignments: normalized,
        participation: summarizeAssignments(assignments, now),
        guidance,
      },
    });
  } catch (error) {
    console.error("Error loading employee reviews:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load employee reviews" } },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const access = await resolveProductForAdmin(auth.user!.email!, id);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: { message: access.message } },
        { status: access.status }
      );
    }

    const body = await request.json();
    const sendNow = body.send === true;
    const expiresInDays = Number.isFinite(Number(body.expiresInDays))
      ? Math.max(1, Math.min(90, Math.round(Number(body.expiresInDays))))
      : 21;
    const employees = Array.isArray(body.employees) ? body.employees : [];
    if (employees.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: "At least one employee is required" } },
        { status: 400 }
      );
    }

    const product = await prisma.storeProductCatalog.findUnique({
      where: { id },
      select: { productName: true, brandId: true, partner: { select: { name: true } } },
    });
    if (!product) {
      return NextResponse.json(
        { success: false, error: { message: "Product not found" } },
        { status: 404 }
      );
    }

    const results: {
      employeeId: string;
      assignmentId: string;
      email: string;
      link: string | null;
      sent: boolean;
      error?: string;
    }[] = [];

    for (const input of employees.slice(0, 50)) {
      const name = cleanText(input?.name);
      const email = typeof input?.email === "string" ? normalizeEmployeeEmail(input.email) : "";
      if (!name || !email || !email.includes("@")) {
        results.push({ employeeId: "", assignmentId: "", email, link: null, sent: false, error: "Invalid employee" });
        continue;
      }

      const token = createReviewToken();
      const employee = await prisma.mycoEmployee.upsert({
        where: { partnerId_email: { partnerId: access.partnerId, email } },
        update: { name, active: true },
        create: { partnerId: access.partnerId, name, email },
      });

      if (employee.optedOut) {
        results.push({ employeeId: employee.id, assignmentId: "", email, link: null, sent: false, error: "Employee opted out" });
        continue;
      }

      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      const existingAssignment = await prisma.mycoEmployeeReviewAssignment.findUnique({
        where: { catalogItemId_employeeId: { catalogItemId: id, employeeId: employee.id } },
        include: { response: true, accessToken: true },
      });
      if (
        existingAssignment?.response ||
        existingAssignment?.status === "submitted" ||
        existingAssignment?.status === "not_familiar"
      ) {
        results.push({
          employeeId: employee.id,
          assignmentId: existingAssignment.id,
          email,
          link: null,
          sent: false,
          error: "Employee already completed this review",
        });
        continue;
      }

      const assignment = await prisma.$transaction(async (tx) => {
        if (existingAssignment?.accessToken) {
          await tx.catalogAccessToken.update({
            where: { id: existingAssignment.accessToken.id },
            data: buildRevokedTokenPatch(auth.user!.email!, "regenerated"),
          });
        }

        const accessToken = await tx.catalogAccessToken.create({
          data: {
            tokenHash: hashCatalogAccessToken(token),
            purpose: "staff_review",
            status: "active",
            partnerId: access.partnerId,
            brandId: product.brandId,
            catalogItemId: id,
            issuedToType: "staff",
            issuedToId: employee.id,
            issuedToEmail: employee.email,
            issuedBy: auth.user!.email!,
            expiresAt,
            regeneratedFromId: existingAssignment?.accessToken?.id ?? null,
          },
        });

        return existingAssignment
          ? tx.mycoEmployeeReviewAssignment.update({
              where: { id: existingAssignment.id },
              data: {
                accessTokenId: accessToken.id,
                tokenHash: hashReviewToken(token),
                status: "assigned",
                expiresAt,
                assignedBy: auth.user!.email!,
                lastSentAt: sendNow ? new Date() : undefined,
                reminderCount: sendNow ? { increment: 1 } : undefined,
              },
            })
          : tx.mycoEmployeeReviewAssignment.create({
              data: {
                catalogItemId: id,
                employeeId: employee.id,
                accessTokenId: accessToken.id,
                tokenHash: hashReviewToken(token),
                expiresAt,
                assignedBy: auth.user!.email!,
                lastSentAt: sendNow ? new Date() : null,
                reminderCount: sendNow ? 1 : 0,
              },
            });
      });

      const link = reviewUrl(request, token);
      let sent = false;
      let error: string | undefined;
      if (sendNow) {
        try {
          const { sendEmail } = await import("@/lib/email");
          await sendEmail({
            to: email,
            subject: `Tripdar product guidance: ${product.productName}`,
            html: `<p>${product.partner.name} is asking for your product guidance on <strong>${product.productName}</strong>.</p><p><a href="${link}">Open your review link</a></p><p>If you are not familiar enough with this product, that is a valid response.</p>`,
            text: `${product.partner.name} is asking for your product guidance on ${product.productName}.\n\nOpen your review link: ${link}\n\nIf you are not familiar enough with this product, that is a valid response.`,
          });
          sent = true;
        } catch (sendError) {
          error = sendError instanceof Error ? sendError.message : "Email send failed";
        }
      }

      results.push({ employeeId: employee.id, assignmentId: assignment.id, email, link, sent, error });
    }

    const status = results.some((result) => result.error) ? 207 : 201;
    return NextResponse.json({ success: true, data: { assignments: results } }, { status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { success: false, error: { message: "Assignment token collision; retry the request" } },
        { status: 409 }
      );
    }
    console.error("Error assigning employee reviews:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to assign employee reviews" } },
      { status: 500 }
    );
  }
}
