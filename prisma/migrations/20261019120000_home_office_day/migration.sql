-- Home office days ("HO" pill in the Einsatzplan), set by managers or by the employee for themselves.
CREATE TABLE "HomeOfficeDay" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeOfficeDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomeOfficeDay_date_idx" ON "HomeOfficeDay"("date");
CREATE UNIQUE INDEX "HomeOfficeDay_employeeId_date_key" ON "HomeOfficeDay"("employeeId", "date");

ALTER TABLE "HomeOfficeDay" ADD CONSTRAINT "HomeOfficeDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
