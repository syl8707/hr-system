"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ChangeAction } from "@/app/generated/prisma/enums";
import { findCheck, REVIEW_ISSUE_LOG_PREFIX } from "./query";

// The signed-in user's email for stamping the dismissal and its change-log
// row. Null until Microsoft login is enforced — same as app/employees/actions.ts.
async function currentUserEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

// Marks one data-completeness issue as dismissed for one employee. This is a
// soft flag: it only inserts a ReviewIssueDismissal row (hiding the issue from
// the active review view) and never touches the employee record itself —
// mirroring how terminated employees are marked rather than deleted. Every
// dismissal is recorded in the change log for the audit trail.
export async function dismissReviewIssue(employeeId: string, checkKey: string) {
  // Only known checks from REVIEW_CHECKS can be dismissed.
  const check = findCheck(checkKey);
  if (!check) {
    throw new Error(`Unknown review check: ${checkKey}`);
  }

  const dismissedBy = await currentUserEmail();

  await prisma.$transaction(async (tx) => {
    // skipDuplicates makes a repeated dismissal (e.g. a double submit from two
    // tabs) a no-op instead of a unique-constraint error, and gates the log
    // entry so repeats don't add audit noise.
    const created = await tx.reviewIssueDismissal.createMany({
      data: [{ employeeId, checkKey: check.key, dismissedBy }],
      skipDuplicates: true,
    });
    if (created.count > 0) {
      await tx.employeeChangeLog.create({
        data: {
          employeeId,
          action: ChangeAction.UPDATE,
          changes: {
            [`${REVIEW_ISSUE_LOG_PREFIX}${check.key}`]: {
              from: "Flagged",
              to: "Dismissed",
            },
          } as Prisma.InputJsonValue,
          changedBy: dismissedBy,
        },
      });
    }
  });

  revalidatePath("/review");
}
