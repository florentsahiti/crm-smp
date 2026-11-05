-- Blocks removed when an absence was entered from the Einsatzplan, so cancelling a wrong
-- absence (e.g. "Krank" on the wrong person) can put them back.
ALTER TABLE "AbsenceEntry" ADD COLUMN "clearedBlocks" JSONB;
