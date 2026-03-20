-- CreateTable
CREATE TABLE "Planejamento" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "notes" TEXT,
    "motoristaId" VARCHAR(191),
    "veiculoId" VARCHAR(191),
    "planStartAt" TIMESTAMP(3),
    "planEndAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planejamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Planejamento_motoristaId_idx" ON "Planejamento"("motoristaId");

-- CreateIndex
CREATE INDEX "Planejamento_veiculoId_idx" ON "Planejamento"("veiculoId");

-- CreateIndex
CREATE INDEX "Planejamento_planStartAt_planEndAt_idx" ON "Planejamento"("planStartAt", "planEndAt");

-- AddForeignKey
ALTER TABLE "Planejamento" ADD CONSTRAINT "Planejamento_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planejamento" ADD CONSTRAINT "Planejamento_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
