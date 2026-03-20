-- DropIndex
DROP INDEX "public"."ItemColetado_etiqueta_key";

-- AlterTable
ALTER TABLE "Coleta" ADD COLUMN     "embarqueAt" TIMESTAMP(3),
ADD COLUMN     "entradaPatioAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fimPatioAt" TIMESTAMP(3),
ADD COLUMN     "status" "ColetaStatus" NOT NULL DEFAULT 'EM_PATIO';

-- AlterTable
ALTER TABLE "Componente" ADD COLUMN     "codigo" TEXT;

-- AlterTable
ALTER TABLE "ItemColetado" ALTER COLUMN "etiqueta" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "tipoCodigo" "TipoCodigoItem" NOT NULL DEFAULT 'FORNECEDOR';

-- CreateTable
CREATE TABLE "ItemVolume" (
    "id" TEXT NOT NULL,
    "itemColetadoId" TEXT NOT NULL,
    "componenteId" TEXT,
    "etiqueta" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedAt" TIMESTAMP(3),
    "status" "ColetaStatus" NOT NULL DEFAULT 'EM_PATIO',

    CONSTRAINT "ItemVolume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemVolume_etiqueta_key" ON "ItemVolume"("etiqueta");

-- CreateIndex
CREATE INDEX "ItemVolume_itemColetadoId_idx" ON "ItemVolume"("itemColetadoId");

-- CreateIndex
CREATE INDEX "ItemVolume_etiqueta_idx" ON "ItemVolume"("etiqueta");

-- AddForeignKey
ALTER TABLE "ItemVolume" ADD CONSTRAINT "ItemVolume_itemColetadoId_fkey" FOREIGN KEY ("itemColetadoId") REFERENCES "ItemColetado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVolume" ADD CONSTRAINT "ItemVolume_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "Componente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
