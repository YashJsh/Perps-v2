-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "averageEntryPrice" INTEGER NOT NULL,
    "averageExitPrice" INTEGER NOT NULL,
    "pnl" INTEGER NOT NULL,
    "market" TEXT NOT NULL,
    "size" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Position_id_key" ON "Position"("id");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
