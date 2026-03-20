-- CreateTable
CREATE TABLE "RoutePlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" TEXT NOT NULL,
    "totalKm" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RoutePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopPlan" (
    "id" TEXT NOT NULL,
    "routePlanId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "km" DOUBLE PRECISION NOT NULL,
    "durMin" INTEGER NOT NULL,

    CONSTRAINT "StopPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StopPlan_routePlanId_order_idx" ON "StopPlan"("routePlanId", "order");

-- AddForeignKey
ALTER TABLE "StopPlan" ADD CONSTRAINT "StopPlan_routePlanId_fkey" FOREIGN KEY ("routePlanId") REFERENCES "RoutePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
