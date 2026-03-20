-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etiqueta" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);
