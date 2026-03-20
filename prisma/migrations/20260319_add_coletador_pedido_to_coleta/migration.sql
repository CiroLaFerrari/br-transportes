-- Add coletador and pedido fields to Coleta
ALTER TABLE "Coleta" ADD COLUMN "coletador" TEXT;
ALTER TABLE "Coleta" ADD COLUMN "pedido" TEXT;
