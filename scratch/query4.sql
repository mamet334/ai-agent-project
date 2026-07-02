SELECT id, summary FROM user_memories WHERE summary ILIKE '%nama%' OR summary ILIKE '%panggilan%' LIMIT 10;
