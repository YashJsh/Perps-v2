/*
  Warnings:

  - You are about to drop the column `filledQty` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `initialMargin` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `qty` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `side` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `slippage` on the `Order` table. All the data in the column will be lost.
  - Added the required column `leverage` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderSide` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `price` on the `Order` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'Cancelled';

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "filledQty",
DROP COLUMN "initialMargin",
DROP COLUMN "qty",
DROP COLUMN "side",
DROP COLUMN "slippage",
ADD COLUMN     "leverage" INTEGER NOT NULL,
ADD COLUMN     "orderSide" "OrderSide" NOT NULL,
ADD COLUMN     "quantity" INTEGER NOT NULL,
DROP COLUMN "price",
ADD COLUMN     "price" INTEGER NOT NULL;
