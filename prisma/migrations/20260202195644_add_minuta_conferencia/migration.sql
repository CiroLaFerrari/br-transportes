-- CreateTable
CREATE TABLE "MinutaConferencia" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "nfNumero" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "motorista" TEXT,
    "dataColeta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinutaConferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinutaItem" (
    "id" TEXT NOT NULL,
    "minutaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "produtoCode" TEXT NOT NULL,
    "produtoDescricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "pesoKg" DOUBLE PRECISION,
    "alturaCm" DOUBLE PRECISION,
    "larguraCm" DOUBLE PRECISION,
    "comprimentoCm" DOUBLE PRECISION,
    "areaM2" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "desmontavel" BOOLEAN NOT NULL DEFAULT false,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinutaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinutaVolume" (
    "id" TEXT NOT NULL,
    "minutaItemId" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pesoKg" DOUBLE PRECISION,
    "alturaCm" DOUBLE PRECISION,
    "larguraCm" DOUBLE PRECISION,
    "comprimentoCm" DOUBLE PRECISION,
    "areaM2" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinutaVolume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MinutaConferencia_nfNumero_idx" ON "MinutaConferencia"("nfNumero");

-- CreateIndex
CREATE INDEX "MinutaConferencia_cliente_idx" ON "MinutaConferencia"("cliente");

-- CreateIndex
CREATE INDEX "MinutaConferencia_cidade_uf_idx" ON "MinutaConferencia"("cidade", "uf");

-- CreateIndex
CREATE INDEX "MinutaItem_minutaId_idx" ON "MinutaItem"("minutaId");

-- CreateIndex
CREATE INDEX "MinutaItem_produtoCode_idx" ON "MinutaItem"("produtoCode");

-- CreateIndex
CREATE INDEX "MinutaVolume_minutaItemId_idx" ON "MinutaVolume"("minutaItemId");

-- CreateIndex
CREATE INDEX "MinutaVolume_etiqueta_idx" ON "MinutaVolume"("etiqueta");

-- AddForeignKey
ALTER TABLE "MinutaItem" ADD CONSTRAINT "MinutaItem_minutaId_fkey" FOREIGN KEY ("minutaId") REFERENCES "MinutaConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutaVolume" ADD CONSTRAINT "MinutaVolume_minutaItemId_fkey" FOREIGN KEY ("minutaItemId") REFERENCES "MinutaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
