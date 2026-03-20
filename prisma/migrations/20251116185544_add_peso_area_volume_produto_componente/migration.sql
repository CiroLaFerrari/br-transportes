/*
  Warnings:

  - Made the column `clienteId` on table `Coleta` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TipoCodigoItem" AS ENUM ('FORNECEDOR', 'INTERNO');

-- CreateEnum
CREATE TYPE "TipoEmbalagem" AS ENUM ('CAIXA_MADEIRA', 'CAIXA_PAPELAO', 'AMARRADO', 'OUTROS');

-- CreateEnum
CREATE TYPE "PosicaoCarga" AS ENUM ('FRONTAL', 'INDIFERENTE');

-- DropForeignKey
ALTER TABLE "public"."Coleta" DROP CONSTRAINT "Coleta_clienteId_fkey";

-- AlterTable
ALTER TABLE "Coleta" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "clienteId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Componente" ADD COLUMN     "areaM2" DOUBLE PRECISION,
ADD COLUMN     "volumeM3" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "pesoKg" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Coleta" ADD CONSTRAINT "Coleta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
