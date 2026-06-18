-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "EmployeeChangeLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeChangeLog_employeeId_createdAt_idx" ON "EmployeeChangeLog"("employeeId", "createdAt");
