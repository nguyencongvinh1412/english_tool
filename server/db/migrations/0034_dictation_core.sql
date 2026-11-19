UPDATE "path_lessons" SET "core" = true, "minutes" = 15 WHERE "kind" = 'dictation' AND "status" = 'todo' AND "phase" <= 3;
