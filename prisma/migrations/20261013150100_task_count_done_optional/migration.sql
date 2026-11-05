-- An hour can have completed CRM tasks without handled calls entered (and vice versa).
ALTER TABLE "TaskCount" ALTER COLUMN "done" DROP NOT NULL;
