-- =============================================================
-- DATABASE SCHEMA VALIDATION & AUDIT SUITE
-- =============================================================

-- -------------------------------------------------------------
-- 1. STRUCTURAL AUDIT: Identify Foreign Keys Missing Indexes
-- -------------------------------------------------------------
-- Unindexed foreign keys cause table scans during joins and ON DELETE CASCADE triggers,
-- which degrades performance, especially in serverless databases like Neon.
SELECT
    con.conname AS constraint_name,
    con.conrelid::regclass AS table_name,
    att.attname AS column_name,
    'CREATE INDEX idx_' || con.conrelid::regclass || '_' || att.attname || 
    ' ON ' || con.conrelid::regclass || '(' || att.attname || ');' AS suggested_fix
FROM pg_constraint con
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
WHERE con.contype = 'f'
  AND NOT EXISTS (
      -- Verify if an index exists where the FK column is the leading column
      SELECT 1 
      FROM pg_index ind
      WHERE ind.indrelid = con.conrelid
        AND ind.indkey[0] = att.attnum
  )
ORDER BY table_name, column_name;

-- -------------------------------------------------------------
-- 2. STRUCTURAL AUDIT: Verify Tables Missing Primary Keys
-- -------------------------------------------------------------
SELECT 
    tab.relname AS table_name,
    'ALTER TABLE ' || tab.relname || ' ADD PRIMARY KEY (id);' AS suggested_fix
FROM pg_class tab
JOIN pg_namespace ns ON ns.oid = tab.relnamespace
WHERE tab.relkind = 'r' -- check user tables only
  AND ns.nspname = 'public'
  AND NOT EXISTS (
      SELECT 1 
      FROM pg_constraint con 
      WHERE con.conrelid = tab.oid 
        AND con.contype = 'p'
  )
ORDER BY table_name;

-- -------------------------------------------------------------
-- 3. DATA INTEGRITY AUDIT: Orphan Records Scanner
-- -------------------------------------------------------------
-- Runs manual checking to find orphan rows, which can occur if foreign key constraints
-- are set to NOT VALID or checks were bypassed during raw bulk-loading.
SELECT 
    'meetings' AS orphan_table, COUNT(m.*) AS orphan_count
FROM meetings m LEFT JOIN users u ON m.user_id = u.id WHERE u.id IS NULL
UNION ALL
SELECT 
    'transcripts' AS orphan_table, COUNT(t.*) AS orphan_count
FROM transcripts t LEFT JOIN meetings m ON t.meeting_id = m.id WHERE m.id IS NULL
UNION ALL
SELECT 
    'summaries' AS orphan_table, COUNT(s.*) AS orphan_count
FROM summaries s LEFT JOIN meetings m ON s.meeting_id = m.id WHERE m.id IS NULL
UNION ALL
SELECT 
    'action_items' AS orphan_table, COUNT(ai.*) AS orphan_count
FROM action_items ai LEFT JOIN meetings m ON ai.meeting_id = m.id WHERE m.id IS NULL
UNION ALL
SELECT 
    'decisions' AS orphan_table, COUNT(d.*) AS orphan_count
FROM decisions d LEFT JOIN meetings m ON d.meeting_id = m.id WHERE m.id IS NULL;

-- -------------------------------------------------------------
-- 4. DATA INTEGRITY AUDIT: Duplicate Records Scanner
-- -------------------------------------------------------------
-- Scans for row-level duplication where business keys are identical.
-- A 1-to-1 violation check (transcripts and summaries).
SELECT 
    'transcripts' AS table_name, meeting_id, COUNT(*) AS duplicate_occurrences
FROM transcripts
GROUP BY meeting_id
HAVING COUNT(*) > 1
UNION ALL
SELECT 
    'summaries' AS table_name, meeting_id, COUNT(*) AS duplicate_occurrences
FROM summaries
GROUP BY meeting_id
HAVING COUNT(*) > 1;

-- -------------------------------------------------------------
-- 5. RECOMMENDATIONS & OPTIMIZATION INDEXES (FIXES)
-- -------------------------------------------------------------
-- To optimize dashboard queries filtering and ordering by task status and due dates:
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_due_date ON action_items(due_date);
