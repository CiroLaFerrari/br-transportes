-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_TRANSIT', 'DONE', 'CANCELED');

-- AlterTable
ALTER TABLE "PlanStore" ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "vehiclePlate" TEXT;
