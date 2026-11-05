-- Only two roles from now on: former team leads become managers.
UPDATE "Employee" SET "role" = 'manager' WHERE "role" = 'team_lead';
