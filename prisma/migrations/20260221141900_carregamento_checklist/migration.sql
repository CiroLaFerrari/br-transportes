-- CreateEnum
CREATE TYPE "CarregamentoStatus" AS ENUM ('ABERTO', 'CONFERIDO', 'SAIDA_LIBERADA');

-- CreateEnum
CREATE TYPE "CarregamentoItemStatus" AS ENUM ('PENDENTE', 'OK', 'FALTA', 'AVARIA');

-- CreateTable
CREATE TABLE "CarregamentoConferencia" (
    "id" TEXT NOT NULL,
    "minutaId" TEXT NOT NULL,
    "status" "CarregamentoStatus" NOT NULL DEFAULT 'ABERTO',
    "conferente" TEXT,
    "motorista" TEXT,
    "placa" TEXT,
    "observacao" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarregamentoConferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarregamentoItem" (
    "id" TEXT NOT NULL,
    "conferenciaId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "status" "CarregamentoItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "checkedAt" TIMESTAMP(3),
    "checkedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarregamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarregamentoConferencia_minutaId_idx" ON "CarregamentoConferencia"("minutaId");

-- CreateIndex
CREATE INDEX "CarregamentoConferencia_status_idx" ON "CarregamentoConferencia"("status");

-- CreateIndex
CREATE INDEX "CarregamentoItem_conferenciaId_idx" ON "CarregamentoItem"("conferenciaId");

-- CreateIndex
CREATE INDEX "CarregamentoItem_etiqueta_idx" ON "CarregamentoItem"("etiqueta");

-- CreateIndex
CREATE UNIQUE INDEX "CarregamentoItem_conferenciaId_etiqueta_key" ON "CarregamentoItem"("conferenciaId", "etiqueta");

-- AddForeignKey
ALTER TABLE "CarregamentoConferencia" ADD CONSTRAINT "CarregamentoConferencia_minutaId_fkey" FOREIGN KEY ("minutaId") REFERENCES "MinutaConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarregamentoItem" ADD CONSTRAINT "CarregamentoItem_conferenciaId_fkey" FOREIGN KEY ("conferenciaId") REFERENCES "CarregamentoConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
