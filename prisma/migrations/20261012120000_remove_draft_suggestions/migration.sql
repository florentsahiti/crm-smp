-- The automatic plan suggestion was removed: delete any suggested (draft) blocks that were never published.
DELETE FROM "ShiftBlock" WHERE "draft" = true;
