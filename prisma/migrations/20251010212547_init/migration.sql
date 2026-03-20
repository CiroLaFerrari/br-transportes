-- CreateEnum
CREATE TYPE "ColetaStatus" AS ENUM ('EM_PATIO', 'CARREGADA', 'EM_TRANSITO', 'ENTREGUE');

-- CreateEnum
CREATE TYPE "RotaStatus" AS ENUM ('PLANEJADA', 'EM_CARREGAMENTO', 'EM_ROTA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "razao" TEXT NOT NULL,
    "cnpj" TEXT,
    "uf" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motorista" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "disponibilidade" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Veiculo" (
    "id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "capacidadeKg" INTEGER NOT NULL,
    "capacidadeM3" DOUBLE PRECISION NOT NULL,
    "compCm" INTEGER NOT NULL,
    "largCm" INTEGER NOT NULL,
    "altCm" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Veiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "compCm" INTEGER NOT NULL,
    "largCm" INTEGER NOT NULL,
    "altCm" INTEGER NOT NULL,
    "fragil" BOOLEAN NOT NULL DEFAULT false,
    "empilhavel" BOOLEAN NOT NULL DEFAULT true,
    "posicao" TEXT,
    "desmontavel" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Componente" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "pesoKg" DOUBLE PRECISION NOT NULL,
    "compCm" INTEGER NOT NULL,
    "largCm" INTEGER NOT NULL,
    "altCm" INTEGER NOT NULL,

    CONSTRAINT "Componente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coleta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "valorFrete" DOUBLE PRECISION NOT NULL,
    "pesoTotalKg" DOUBLE PRECISION NOT NULL,
    "status" "ColetaStatus" NOT NULL DEFAULT 'EM_PATIO',
    "dtEntradaPatio" TIMESTAMP(3),
    "dtCarregamento" TIMESTAMP(3),
    "dtSaidaPatio" TIMESTAMP(3),
    "dtEntrega" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coleta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemColetado" (
    "id" TEXT NOT NULL,
    "coletaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "etiqueta" TEXT NOT NULL,

    CONSTRAINT "ItemColetado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rota" (
    "id" TEXT NOT NULL,
    "dataRota" TIMESTAMP(3) NOT NULL,
    "motoristaId" TEXT,
    "veiculoId" TEXT,
    "kmTotal" INTEGER,
    "freteTotal" DOUBLE PRECISION,
    "freteMotorista" DOUBLE PRECISION,
    "status" "RotaStatus" NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parada" (
    "id" TEXT NOT NULL,
    "rotaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "coletaId" TEXT NOT NULL,

    CONSTRAINT "Parada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cnpj_key" ON "Cliente"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Veiculo_placa_key" ON "Veiculo"("placa");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigo_key" ON "Produto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ItemColetado_etiqueta_key" ON "ItemColetado"("etiqueta");

-- AddForeignKey
ALTER TABLE "Componente" ADD CONSTRAINT "Componente_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coleta" ADD CONSTRAINT "Coleta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemColetado" ADD CONSTRAINT "ItemColetado_coletaId_fkey" FOREIGN KEY ("coletaId") REFERENCES "Coleta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemColetado" ADD CONSTRAINT "ItemColetado_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rota" ADD CONSTRAINT "Rota_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rota" ADD CONSTRAINT "Rota_veiculoId_fkey" FOREIGN KEY ("veiculoId") REFERENCES "Veiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parada" ADD CONSTRAINT "Parada_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parada" ADD CONSTRAINT "Parada_coletaId_fkey" FOREIGN KEY ("coletaId") REFERENCES "Coleta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
