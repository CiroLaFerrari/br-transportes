-- AlterTable: convert posicao from String to PosicaoCarga enum
-- First nullify any invalid values, then alter column type
UPDATE "Produto" SET "posicao" = NULL WHERE "posicao" IS NOT NULL AND "posicao" NOT IN ('FRONTAL', 'INDIFERENTE');

ALTER TABLE "Produto" ALTER COLUMN "posicao" TYPE "PosicaoCarga" USING ("posicao"::"PosicaoCarga");

-- AlterTable: convert tipoEmbalagem from String to TipoEmbalagem enum
UPDATE "Produto" SET "tipoEmbalagem" = NULL WHERE "tipoEmbalagem" IS NOT NULL AND "tipoEmbalagem" NOT IN ('CAIXA_MADEIRA', 'CAIXA_PAPELAO', 'AMARRADO', 'OUTROS');

ALTER TABLE "Produto" ALTER COLUMN "tipoEmbalagem" TYPE "TipoEmbalagem" USING ("tipoEmbalagem"::"TipoEmbalagem");
