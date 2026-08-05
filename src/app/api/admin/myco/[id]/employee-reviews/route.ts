import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/domain/auth/adminSession";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveProductForAdmin } from "@/domain/myco/adminAccess";
import {
  aggregateEmployeeGuidance,
  buildStaffReviewInviteMessageArtifacts,
  createReviewToken,
  digestCanonical,
  digestStaffReviewInviteRoster,
  effectiveAssignmentStatus,
  hashReviewToken,
  normalizeEmployeeEmail,
  providerCredentialFingerprint,
  validateStaffReviewInviteSend,
  summarizeAssignments,
} from "@/domain/myco/employeeReviews";
import { buildRevokedTokenPatch, hashCatalogAccessToken } from "@/domain/myco/catalogTokens";

const REVIEW_INVITE_SENDER = "Tripdar <noreply@tripd.ar>";
const SENDABLE_BATCH_STATUSES = ["approved", "sending", "partial"] as const;

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

function providerMessageId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function syncBatchSendStatus(batchId: string): Promise<void> {
  const [totalRecipients, sentCount, blockedCount, pendingCount, failedCount] = await Promise.all([
    prisma.staffReviewInviteRecipient.count({ where: { batchId } }),
    prisma.staffReviewInviteRecipient.count({ where: { batchId, status: "sent" } }),
    prisma.staffReviewInviteRecipient.count({ where: { batchId, status: "blocked" } }),
    prisma.staffReviewInviteRecipient.count({ where: { batchId, status: "pending" } }),
    prisma.staffReviewInviteRecipient.count({ where: { batchId, status: "failed" } }),
  ]);
  const status =
    totalRecipients > 0 && sentCount === totalRecipients
      ? "sent"
      : blockedCount > 0
        ? "blocked"
        : sentCount > 0 || failedCount > 0
          ? "partial"
          : pendingCount > 0
            ? "approved"
            : "blocked";
  await prisma.staffReviewInviteBatch.update({
    where: { id: batchId },
    data: { status, sentCount, blockedCount },
  });
}

async function persistNoSendEvidence(input: {
  batchId: string;
  recipientId: string;
  assignmentId: string;
  employeeId: string;
  accessTokenId: string;
  partnerId: string;
  reason: string;
  detail: Record<string, string | null>;
}): Promise<void> {
  await prisma.$transaction([
    prisma.staffReviewInviteNoSendEvidence.create({
      data: {
        batchId: input.batchId,
        recipientId: input.recipientId,
        assignmentId: input.assignmentId,
        employeeId: input.employeeId,
        accessTokenId: input.accessTokenId,
        partnerId: input.partnerId,
        reason: input.reason,
        detail: input.detail,
        requiresApproval: true,
      },
    }),
    prisma.staffReviewInviteRecipient.update({
      where: { id: input.recipientId },
      data: {
        status: "blocked",
        blockedAt: new Date(),
        failureCode: input.reason,
        failureReason: "Send refused before provider call; new approval required.",
      },
    }),
  ]);
}

export async function sendApprovedReviewInviteBatch(input: {
  batchId: string;
  catalogItemId: string;
  partnerId: string;
}) {
  const batch = await prisma.staffReviewInviteBatch.findFirst({
    where: {
      id: input.batchId,
      catalogItemId: input.catalogItemId,
      partnerId: input.partnerId,
    },
    include: {
      catalogItem: {
        select: {
          id: true,
          partnerId: true,
          brandId: true,
          productName: true,
          partner: { select: { name: true } },
        },
      },
      recipients: {
        where: { status: { in: ["pending", "failed"] } },
        orderBy: [{ createdAt: "asc" }],
        include: {
          assignment: {
            include: {
              accessToken: true,
              employee: { select: { id: true, partnerId: true, email: true, active: true, optedOut: true } },
              catalogItem: { select: { id: true, partnerId: true, brandId: true } },
            },
          },
        },
      },
    },
  });

  if (!batch) {
    return { ok: false as const, status: 404, sent: 0, blocked: 0, errors: ["Batch not found"] };
  }

  const batchIsSendable = SENDABLE_BATCH_STATUSES.includes(batch.status as (typeof SENDABLE_BATCH_STATUSES)[number]);
  if (!batchIsSendable && batch.recipients.length === 0) {
    return {
      ok: false as const,
      status: 409,
      sent: 0,
      blocked: 0,
      errors: [`Batch is ${batch.status}`],
    };
  }

  if (batchIsSendable) {
    await prisma.staffReviewInviteBatch.update({
      where: { id: batch.id },
      data: { status: "sending" },
    });
  }

  let sent = 0;
  let blocked = 0;
  const errors: string[] = [];
  for (const recipient of batch.recipients) {
    const artifacts = {
      sender: recipient.sender,
      subject: recipient.subject,
      html: recipient.html,
      text: recipient.text,
      link: recipient.link,
      subjectDigest: digestCanonical(recipient.subject),
      htmlDigest: digestCanonical(recipient.html),
      textDigest: digestCanonical(recipient.text),
      linkDigest: digestCanonical(recipient.link),
    };
    const validation = validateStaffReviewInviteSend(
      {
        batchId: batch.id,
        batchStatus: batch.status,
        recipientId: recipient.id,
        recipientStatus: recipient.status,
        providerMessageId: recipient.providerMessageId,
        assignmentId: recipient.assignmentId,
        employeeId: recipient.employeeId,
        accessTokenId: recipient.accessTokenId,
        catalogItemId: recipient.catalogItemId,
        partnerId: recipient.partnerId,
        tokenHash: recipient.tokenHash,
        accessTokenHash: recipient.accessTokenHash,
        recipientEmailNormalized: recipient.recipientEmailNormalized,
        expiresAt: recipient.expiresAt,
        rosterDigest: recipient.rosterDigest,
        sender: recipient.sender,
        subjectDigest: recipient.subjectDigest,
        htmlDigest: recipient.htmlDigest,
        textDigest: recipient.textDigest,
        linkDigest: recipient.linkDigest,
        providerCredentialFingerprint: recipient.providerCredentialFingerprint,
      },
      {
        providerCredentialFingerprint: providerCredentialFingerprint(),
        rosterDigest: batch.rosterDigest,
        sender: artifacts.sender,
        subjectDigest: artifacts.subjectDigest,
        htmlDigest: artifacts.htmlDigest,
        textDigest: artifacts.textDigest,
        linkDigest: artifacts.linkDigest,
        assignment: recipient.assignment,
      }
    );
    if (!validation.ok) {
      await persistNoSendEvidence({
        batchId: batch.id,
        recipientId: recipient.id,
        assignmentId: recipient.assignmentId,
        employeeId: recipient.employeeId,
        accessTokenId: recipient.accessTokenId,
        partnerId: recipient.partnerId,
        reason: validation.reason,
        detail: validation.detail,
      });
      blocked += 1;
      errors.push(`${recipient.recipientEmailNormalized}: ${validation.reason}`);
      continue;
    }

    try {
      await prisma.staffReviewInviteRecipient.update({
        where: { id: recipient.id },
        data: { status: "sending", failureCode: null, failureReason: null },
      });
      const { sendEmail } = await import("@/lib/email");
      const result = await sendEmail({
        to: recipient.recipientEmailNormalized,
        from: recipient.sender,
        subject: artifacts.subject,
        html: artifacts.html,
        text: artifacts.text,
      });
      await prisma.staffReviewInviteRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          providerMessageId: providerMessageId(result),
          failureCode: null,
          failureReason: null,
        },
      });
      await prisma.mycoEmployeeReviewAssignment.update({
        where: { id: recipient.assignmentId },
        data: {
          lastSentAt: new Date(),
          reminderCount: { increment: 1 },
        },
      });
      sent += 1;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Email send failed";
      await prisma.staffReviewInviteRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "failed",
          failureCode: "provider_error",
          failureReason: message,
        },
      });
      errors.push(`${recipient.recipientEmailNormalized}: ${message}`);
    }
  }

  await syncBatchSendStatus(batch.id);
  return { ok: errors.length === 0, status: errors.length === 0 ? 200 : 207, sent, blocked, errors };
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
    const requestedBatchId = cleanText(body.batchId);
    if (requestedBatchId) {
      if (!sendNow) {
        return NextResponse.json(
          { success: false, error: { message: "batchId recovery requires send=true" } },
          { status: 400 }
        );
      }
      const sendResult = await sendApprovedReviewInviteBatch({
        batchId: requestedBatchId,
        catalogItemId: id,
        partnerId: access.partnerId,
      });
      return NextResponse.json(
        {
          success: sendResult.status < 400,
          data: {
            batchId: requestedBatchId,
            sent: sendResult.sent,
            blocked: sendResult.blocked,
            errors: sendResult.errors,
          },
          ...(!sendResult.ok ? { error: { message: sendResult.errors[0] ?? "Batch send incomplete" } } : {}),
        },
        { status: sendResult.status }
      );
    }

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
      select: { id: true, partnerId: true, productName: true, brandId: true, partner: { select: { name: true } } },
    });
    if (!product) {
      return NextResponse.json(
        { success: false, error: { message: "Product not found" } },
        { status: 404 }
      );
    }

    type AssignmentResult = {
      batchId: string | null;
      employeeId: string;
      assignmentId: string;
      email: string;
      link: string | null;
      sent: boolean;
      error?: string;
    };
    type PreparedRecipient = {
      employeeId: string;
      employeeName: string;
      assignmentId: string;
      accessTokenId: string;
      tokenHash: string;
      accessTokenHash: string;
      email: string;
      expiresAt: Date;
      artifacts: ReturnType<typeof buildStaffReviewInviteMessageArtifacts>;
    };

    const prepared = await prisma.$transaction(async (tx) => {
      const results: AssignmentResult[] = [];
      const recipients: PreparedRecipient[] = [];

      for (const input of employees.slice(0, 50)) {
        const name = cleanText(input?.name);
        const email = typeof input?.email === "string" ? normalizeEmployeeEmail(input.email) : "";
        if (!name || !email || !email.includes("@")) {
          results.push({
            batchId: null,
            employeeId: "",
            assignmentId: "",
            email,
            link: null,
            sent: false,
            error: "Invalid employee",
          });
          continue;
        }

        const token = createReviewToken();
        const employee = await tx.mycoEmployee.upsert({
          where: { partnerId_email: { partnerId: access.partnerId, email } },
          update: { name, active: true },
          create: { partnerId: access.partnerId, name, email },
        });

        if (employee.optedOut) {
          results.push({
            batchId: null,
            employeeId: employee.id,
            assignmentId: "",
            email,
            link: null,
            sent: false,
            error: "Employee opted out",
          });
          continue;
        }

        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
        const existingAssignment = await tx.mycoEmployeeReviewAssignment.findUnique({
          where: { catalogItemId_employeeId: { catalogItemId: id, employeeId: employee.id } },
          include: { response: true, accessToken: true },
        });
        if (
          existingAssignment?.response ||
          existingAssignment?.status === "submitted" ||
          existingAssignment?.status === "not_familiar"
        ) {
          results.push({
            batchId: null,
            employeeId: employee.id,
            assignmentId: existingAssignment.id,
            email,
            link: null,
            sent: false,
            error: "Employee already completed this review",
          });
          continue;
        }

        if (existingAssignment?.accessToken) {
          await tx.catalogAccessToken.update({
            where: { id: existingAssignment.accessToken.id },
            data: buildRevokedTokenPatch(auth.user!.email!, "regenerated"),
          });
        }

        const accessTokenHash = hashCatalogAccessToken(token);
        const accessToken = await tx.catalogAccessToken.create({
          data: {
            tokenHash: accessTokenHash,
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

        const reviewTokenHash = hashReviewToken(token);
        const assignment = existingAssignment
          ? await tx.mycoEmployeeReviewAssignment.update({
              where: { id: existingAssignment.id },
              data: {
                accessTokenId: accessToken.id,
                tokenHash: reviewTokenHash,
                status: "assigned",
                expiresAt,
                assignedBy: auth.user!.email!,
              },
            })
          : await tx.mycoEmployeeReviewAssignment.create({
              data: {
                catalogItemId: id,
                employeeId: employee.id,
                accessTokenId: accessToken.id,
                tokenHash: reviewTokenHash,
                expiresAt,
                assignedBy: auth.user!.email!,
              },
            });

        const link = reviewUrl(request, token);
        const artifacts = buildStaffReviewInviteMessageArtifacts({
          sender: REVIEW_INVITE_SENDER,
          partnerName: product.partner.name,
          productName: product.productName,
          link,
        });
        recipients.push({
          employeeId: employee.id,
          employeeName: employee.name,
          assignmentId: assignment.id,
          accessTokenId: accessToken.id,
          tokenHash: reviewTokenHash,
          accessTokenHash,
          email: employee.email,
          expiresAt,
          artifacts,
        });
        results.push({
          batchId: null,
          employeeId: employee.id,
          assignmentId: assignment.id,
          email,
          link,
          sent: false,
        });
      }

      if (recipients.length === 0) return { batchId: null, results };

      const rosterDigest = digestStaffReviewInviteRoster(
        recipients.map((recipient) => ({
          employeeId: recipient.employeeId,
          email: recipient.email,
          assignmentId: recipient.assignmentId,
          accessTokenId: recipient.accessTokenId,
        }))
      );
      const batchSubjectDigest = digestCanonical(
        recipients.map((recipient) => ({
          employeeId: recipient.employeeId,
          subjectDigest: recipient.artifacts.subjectDigest,
        }))
      );
      const batchHtmlDigest = digestCanonical(
        recipients.map((recipient) => ({
          employeeId: recipient.employeeId,
          htmlDigest: recipient.artifacts.htmlDigest,
        }))
      );
      const batchTextDigest = digestCanonical(
        recipients.map((recipient) => ({
          employeeId: recipient.employeeId,
          textDigest: recipient.artifacts.textDigest,
        }))
      );
      const providerFingerprint = providerCredentialFingerprint();

      await tx.staffReviewInviteBatch.updateMany({
        where: {
          partnerId: access.partnerId,
          catalogItemId: id,
          status: { in: ["approved", "sending", "partial"] },
        },
        data: { status: "superseded" },
      });

      const batch = await tx.staffReviewInviteBatch.create({
        data: {
          partnerId: access.partnerId,
          catalogItemId: id,
          status: "approved",
          approvedBy: auth.user!.email!,
          expiresInDays,
          rosterDigest,
          sender: REVIEW_INVITE_SENDER,
          subjectDigest: batchSubjectDigest,
          htmlDigest: batchHtmlDigest,
          textDigest: batchTextDigest,
          providerCredentialFingerprint: providerFingerprint,
          totalRecipients: recipients.length,
        },
      });

      for (const recipient of recipients) {
        await tx.staffReviewInviteRecipient.create({
          data: {
            batchId: batch.id,
            assignmentId: recipient.assignmentId,
            employeeId: recipient.employeeId,
            accessTokenId: recipient.accessTokenId,
            catalogItemId: id,
            partnerId: access.partnerId,
            tokenHash: recipient.tokenHash,
            accessTokenHash: recipient.accessTokenHash,
            recipientEmail: recipient.email,
            recipientEmailNormalized: normalizeEmployeeEmail(recipient.email),
            employeeName: recipient.employeeName,
            expiresAt: recipient.expiresAt,
            link: recipient.artifacts.link,
            subject: recipient.artifacts.subject,
            html: recipient.artifacts.html,
            text: recipient.artifacts.text,
            linkDigest: recipient.artifacts.linkDigest,
            subjectDigest: recipient.artifacts.subjectDigest,
            htmlDigest: recipient.artifacts.htmlDigest,
            textDigest: recipient.artifacts.textDigest,
            rosterDigest,
            sender: recipient.artifacts.sender,
            providerCredentialFingerprint: providerFingerprint,
          },
        });
      }

      return {
        batchId: batch.id,
        results: results.map((result) => ({
          ...result,
          batchId: result.assignmentId ? batch.id : null,
        })),
      };
    });

    let results = prepared.results;
    let sendResult: Awaited<ReturnType<typeof sendApprovedReviewInviteBatch>> | null = null;
    if (sendNow && prepared.batchId) {
      sendResult = await sendApprovedReviewInviteBatch({
        batchId: prepared.batchId,
        catalogItemId: id,
        partnerId: access.partnerId,
      });
      const recipientStates = await prisma.staffReviewInviteRecipient.findMany({
        where: { batchId: prepared.batchId },
        select: { assignmentId: true, status: true, failureReason: true, failureCode: true },
      });
      const stateByAssignment = new Map(recipientStates.map((recipient) => [recipient.assignmentId, recipient]));
      results = results.map((result) => {
        const state = stateByAssignment.get(result.assignmentId);
        if (!state) return result;
        return {
          ...result,
          sent: state.status === "sent",
          error: state.status === "sent" ? result.error : (state.failureReason ?? state.failureCode ?? result.error),
        };
      });
    }

    const status = results.some((result) => result.error) || (sendResult && !sendResult.ok) ? 207 : 201;
    return NextResponse.json(
      {
        success: true,
        data: {
          batchId: prepared.batchId,
          assignments: results,
          ...(sendResult
            ? { send: { sent: sendResult.sent, blocked: sendResult.blocked, errors: sendResult.errors } }
            : {}),
        },
      },
      { status }
    );
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
