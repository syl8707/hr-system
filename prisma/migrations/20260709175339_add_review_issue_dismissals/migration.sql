-- CreateTable
CREATE TABLE "ReviewIssueDismissal" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "dismissedBy" TEXT,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewIssueDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewIssueDismissal_employeeId_checkKey_key" ON "ReviewIssueDismissal"("employeeId", "checkKey");

-- AddForeignKey
ALTER TABLE "ReviewIssueDismissal" ADD CONSTRAINT "ReviewIssueDismissal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
