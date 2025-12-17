-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashRegisterTransactionType" AS ENUM ('OPENING', 'CASH_SALE', 'CASH_RETURN', 'CASH_IN', 'CASH_OUT', 'CLOSING', 'RECONCILIATION');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3),
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'OPEN',
    "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(65,30),
    "expectedBalance" DECIMAL(65,30),
    "actualBalance" DECIMAL(65,30),
    "difference" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegisterTransaction" (
    "id" SERIAL NOT NULL,
    "cashRegisterId" INTEGER NOT NULL,
    "type" "CashRegisterTransactionType" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT,
    "orderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashRegisterTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashRegister_userId_idx" ON "CashRegister"("userId");

-- CreateIndex
CREATE INDEX "CashRegister_date_idx" ON "CashRegister"("date");

-- CreateIndex
CREATE INDEX "CashRegister_status_idx" ON "CashRegister"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_userId_date_key" ON "CashRegister"("userId", "date");

-- CreateIndex
CREATE INDEX "CashRegisterTransaction_cashRegisterId_idx" ON "CashRegisterTransaction"("cashRegisterId");

-- CreateIndex
CREATE INDEX "CashRegisterTransaction_type_idx" ON "CashRegisterTransaction"("type");

-- CreateIndex
CREATE INDEX "CashRegisterTransaction_orderId_idx" ON "CashRegisterTransaction"("orderId");

-- CreateIndex
CREATE INDEX "CashRegisterTransaction_createdAt_idx" ON "CashRegisterTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterTransaction" ADD CONSTRAINT "CashRegisterTransaction_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterTransaction" ADD CONSTRAINT "CashRegisterTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
