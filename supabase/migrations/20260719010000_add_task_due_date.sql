-- Tasks have no date dimension today: the "Today's tasks" dashboard widget
-- is really just "first 6 incomplete tasks in insertion order," with no way
-- to express or see when something is actually due. Add an optional
-- due_date so tasks can be sorted/highlighted by urgency the same way
-- exams already are.

ALTER TABLE "public"."tasks" ADD COLUMN "due_date" date;
