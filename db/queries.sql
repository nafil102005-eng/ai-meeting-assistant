-- -------------------------------------------------------------
-- COMMON APPLICATION QUERY EXAMPLES
-- -------------------------------------------------------------

-- 1. Fetch User Dashboard Summary Statistics
-- Retrieves total meeting count and aggregated action item status counts for a user.
SELECT 
    COUNT(DISTINCT m.id) AS total_meetings,
    COUNT(DISTINCT CASE WHEN ai.status = 'pending' THEN ai.id END) AS pending_action_items,
    COUNT(DISTINCT CASE WHEN ai.status = 'in_progress' THEN ai.id END) AS in_progress_action_items,
    COUNT(DISTINCT CASE WHEN ai.status = 'completed' THEN ai.id END) AS completed_action_items
FROM users u
LEFT JOIN meetings m ON m.user_id = u.id
LEFT JOIN action_items ai ON ai.meeting_id = m.id
WHERE u.id = 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a'
GROUP BY u.id;

-- 2. Fetch User's Meetings with Pagination and Optional Title Search
-- Highly optimized using indices.
SELECT 
    m.id, 
    m.title, 
    m.platform, 
    m.date, 
    m.duration_seconds,
    s.summary_text,
    COUNT(ai.id) as action_items_count
FROM meetings m
LEFT JOIN summaries s ON s.meeting_id = m.id
LEFT JOIN action_items ai ON ai.meeting_id = m.id
WHERE m.user_id = 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a'
  AND m.title ILIKE '%Launch%' -- Optional search pattern
GROUP BY m.id, s.summary_text
ORDER BY m.date DESC
LIMIT 10 OFFSET 0;

-- 3. Fetch Single Meeting Details (Transcript + Summary + Items)
-- This query aggregates associated elements into a clean nested JSON format.
SELECT 
    m.id,
    m.title,
    m.platform,
    m.date,
    m.duration_seconds,
    m.user_id,
    t.raw_text AS transcript_raw,
    s.summary_text,
    s.key_takeaways,
    COALESCE(
        (SELECT json_agg(json_build_object(
            'id', ai.id,
            'description', ai.description,
            'assignee', ai.assignee,
            'due_date', ai.due_date,
            'status', ai.status
         )) FROM action_items ai WHERE ai.meeting_id = m.id), 
        '[]'::json
    ) AS action_items,
    COALESCE(
        (SELECT json_agg(json_build_object(
            'id', d.id,
            'description', d.description,
            'decider', d.decider
         )) FROM decisions d WHERE d.meeting_id = m.id), 
        '[]'::json
    ) AS decisions
FROM meetings m
LEFT JOIN transcripts t ON t.meeting_id = m.id
LEFT JOIN summaries s ON s.meeting_id = m.id
WHERE m.id = 'a0000000-0000-0000-0000-000000000002';

-- 4. Full-Text Search (FTS) across Transcripts
-- Uses the GIN tsvector index to find keywords in raw transcripts.
SELECT 
    m.id AS meeting_id, 
    m.title, 
    m.date,
    ts_headline('english', t.raw_text, to_tsquery('english', 'security & filters')) AS match_snippet
FROM meetings m
JOIN transcripts t ON t.meeting_id = m.id
WHERE m.user_id = 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a'
  AND to_tsvector('english', t.raw_text) @@ to_tsquery('english', 'security & filters');

-- 5. Fetch Pending Action Items grouped by Assignee
SELECT 
    assignee,
    COUNT(*) as pending_count,
    json_agg(json_build_object(
        'meeting_title', m.title,
        'description', ai.description,
        'due_date', ai.due_date
    )) as tasks
FROM action_items ai
JOIN meetings m ON m.meeting_id = ai.meeting_id
WHERE m.user_id = 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a'
  AND ai.status != 'completed'
GROUP BY assignee;
