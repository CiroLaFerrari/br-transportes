-- CreateTable
CREATE TABLE "GeoCache" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "query" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GeoCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirCache" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "aNorm" TEXT NOT NULL,
    "bNorm" TEXT NOT NULL,
    "km" DOUBLE PRECISION NOT NULL,
    "durMin" INTEGER NOT NULL,
    "geojson" JSONB NOT NULL,

    CONSTRAINT "DirCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeoCache_norm_key" ON "GeoCache"("norm");

-- CreateIndex
CREATE UNIQUE INDEX "DirCache_aNorm_bNorm_key" ON "DirCache"("aNorm", "bNorm");
