-- Forecast per weekday: CRM forecast per day and a standard pattern per weekday.
ALTER TABLE "ForecastDay" ADD COLUMN "crmTotal" INTEGER;

CREATE TABLE "ForecastWeekdayDefault" (
    "id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "calls" INTEGER NOT NULL,
    "crm" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastWeekdayDefault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastWeekdayDefault_weekday_key" ON "ForecastWeekdayDefault"("weekday");
