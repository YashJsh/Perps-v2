-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('Limit', 'Market');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('Buy', 'Sell');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('Open', 'Filled', 'Partially_Filled', 'Closed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "side" "OrderSide" NOT NULL,
    "price" TEXT NOT NULL,
    "slippage" INTEGER NOT NULL,
    "qty" TEXT NOT NULL,
    "initialMargin" TEXT NOT NULL,
    "filledQty" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Fills" (
    "id" TEXT NOT NULL,
    "maker_id" TEXT NOT NULL,
    "taker_id" TEXT NOT NULL,
    "qty" TEXT NOT NULL,
    "maker_order_id" TEXT NOT NULL,
    "taker_order_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Market_id_key" ON "Market"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_key" ON "Order"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Fills_id_key" ON "Fills"("id");
