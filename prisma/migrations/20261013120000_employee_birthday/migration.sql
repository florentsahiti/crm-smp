-- Birthday on the employee: day + month only, never the year.
ALTER TABLE "Employee" ADD COLUMN "birthDay" INTEGER;
ALTER TABLE "Employee" ADD COLUMN "birthMonth" INTEGER;
