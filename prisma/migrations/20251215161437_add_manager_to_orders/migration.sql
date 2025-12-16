-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createdByManagerId" INTEGER;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByManagerId_fkey" FOREIGN KEY ("createdByManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
