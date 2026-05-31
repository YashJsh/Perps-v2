/*
  Warnings:

  - You are about to drop the column `market_id` on the `Fills` table. All the data in the column will be lost.
  - Changed the type of `qty` on the `Fills` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Fills" DROP COLUMN "market_id",
DROP COLUMN "qty",
ADD COLUMN     "qty" INTEGER NOT NULL;
