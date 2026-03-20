-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "ajudantes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "localEntrega" TEXT,
ADD COLUMN     "particularidades" TEXT,
ADD COLUMN     "percentualFrete" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MinutaConferencia" ADD COLUMN     "coletador" TEXT,
ADD COLUMN     "pedido" TEXT;
