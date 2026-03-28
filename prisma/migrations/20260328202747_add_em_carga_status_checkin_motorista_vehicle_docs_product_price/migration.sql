-- AlterEnum
ALTER TYPE "ColetaStatus" ADD VALUE 'EM_CARGA';

-- AlterTable
ALTER TABLE "Motorista" ADD COLUMN     "cnhUrl" TEXT,
ADD COLUMN     "cnhVencimento" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "precoUnitario" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Veiculo" ADD COLUMN     "documentosUrl" TEXT,
ADD COLUMN     "documentosVencimento" TIMESTAMP(3),
ADD COLUMN     "licenciamentoUrl" TEXT,
ADD COLUMN     "licenciamentoVencimento" TIMESTAMP(3),
ADD COLUMN     "numEixos" INTEGER;

-- CreateTable
CREATE TABLE "CheckinMotorista" (
    "id" TEXT NOT NULL,
    "motoristaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localizacao" TEXT NOT NULL,
    "observacao" TEXT,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinMotorista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckinMotorista_motoristaId_data_idx" ON "CheckinMotorista"("motoristaId", "data");

-- CreateIndex
CREATE INDEX "CheckinMotorista_data_idx" ON "CheckinMotorista"("data");

-- AddForeignKey
ALTER TABLE "CheckinMotorista" ADD CONSTRAINT "CheckinMotorista_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE CASCADE ON UPDATE CASCADE;
