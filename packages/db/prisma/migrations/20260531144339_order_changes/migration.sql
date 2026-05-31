/*
  Warnings:

  - Added the required column `market` to the `Fills` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Fills" ADD COLUMN     "market" TEXT NOT NULL;
