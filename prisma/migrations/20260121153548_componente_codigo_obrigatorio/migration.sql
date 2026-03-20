/*
  Warnings:

  - A unique constraint covering the columns `[produtoId,codigo]` on the table `Componente` will be added. If there are existing duplicate values, this will fail.
  - Made the column `codigo` on table `Componente` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Componente" ALTER COLUMN "codigo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Componente_produtoId_codigo_key" ON "Componente"("produtoId", "codigo");
