-- Deleting a folder should delete its contents, not silently orphan them.
--
-- materials, quizzes, and flashcard_decks.folder_id were all
-- ON DELETE SET NULL, meaning "Delete folder" in the UI only removed the
-- folder row while leaving every material/quiz/deck it contained
-- permanently detached (folder_id = NULL) with no UI path back to them.
-- The app's own delete-folder confirmation now promises real deletion of
-- folder contents, so the schema needs to actually match that.
--
-- study_sessions.folder_id is intentionally left as SET NULL: it's a
-- historical study-time log, not folder content, and losing analytics
-- history because a folder was later deleted would be a separate,
-- unwanted data loss.

ALTER TABLE "public"."materials"
    DROP CONSTRAINT "materials_folder_id_fkey",
    ADD CONSTRAINT "materials_folder_id_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;

ALTER TABLE "public"."quizzes"
    DROP CONSTRAINT "quizzes_folder_id_fkey",
    ADD CONSTRAINT "quizzes_folder_id_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;

ALTER TABLE "public"."flashcard_decks"
    DROP CONSTRAINT "flashcard_decks_folder_id_fkey",
    ADD CONSTRAINT "flashcard_decks_folder_id_fkey"
        FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;
