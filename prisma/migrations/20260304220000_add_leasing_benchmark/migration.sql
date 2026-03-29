-- CreateTable
CREATE TABLE "leasing_benchmark" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "segment" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "p25" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p75" DOUBLE PRECISION NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leasing_benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leasing_benchmark_date_segment_metric_key" ON "leasing_benchmark"("date", "segment", "metric");
