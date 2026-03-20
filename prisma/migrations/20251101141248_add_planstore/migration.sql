-- CreateTable
CREATE TABLE "PlanStore" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "PlanStore_pkey" PRIMARY KEY ("id")
);
