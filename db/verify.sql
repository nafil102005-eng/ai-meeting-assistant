-- =============================================================
-- AUTOMATED SCHEMA VERIFICATION SUITE
-- Runs in a transactional block to verify constraints without polluting database.
-- =============================================================

BEGIN;

-- Setup temp testing variables / schema logs
SET client_min_messages = NOTICE;

-- -------------------------------------------------------------
-- TEST 1: Foreign Key Integrity (Invalid User -> Meeting)
-- -------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        INSERT INTO meetings (id, user_id, title)
        VALUES ('f0000000-0000-0000-0000-000000000001', 'clerk_non_existent', 'Orphaned Meeting');
        RAISE EXCEPTION 'TEST 1 FAILED: Allowed insertion of a meeting with non-existent user_id.';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'TEST 1 PASSED: Correctly blocked meeting insertion with non-existent user_id.';
    END;
END $$;

-- -------------------------------------------------------------
-- TEST 2: Duplicate Prevention (1-to-1 Meeting to Transcript)
-- -------------------------------------------------------------
DO $$
DECLARE
    v_meeting_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
    BEGIN
        -- Attempt to insert a second transcript for meeting A1 (A1 already has a transcript seeded)
        INSERT INTO transcripts (meeting_id, raw_text)
        VALUES (v_meeting_id, 'Duplicate transcript raw text.');
        RAISE EXCEPTION 'TEST 2 FAILED: Allowed insertion of duplicate transcripts for a single meeting (1:1 violation).';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'TEST 2 PASSED: Correctly blocked duplicate transcript insertion (1:1 constraint verified).';
    END;
END $$;

-- -------------------------------------------------------------
-- TEST 3: Duplicate Prevention (1-to-1 Meeting to Summary)
-- -------------------------------------------------------------
DO $$
DECLARE
    v_meeting_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
    BEGIN
        -- Attempt to insert a second summary for meeting A1 (A1 already has a summary seeded)
        INSERT INTO summaries (meeting_id, summary_text, key_takeaways)
        VALUES (v_meeting_id, 'Duplicate summary', '[]');
        RAISE EXCEPTION 'TEST 3 FAILED: Allowed insertion of duplicate summaries for a single meeting (1:1 violation).';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'TEST 3 PASSED: Correctly blocked duplicate summary insertion (1:1 constraint verified).';
    END;
END $$;

-- -------------------------------------------------------------
-- TEST 4: Invalid Status Constraint on Action Items
-- -------------------------------------------------------------
DO $$
DECLARE
    v_meeting_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
    BEGIN
        INSERT INTO action_items (meeting_id, description, status)
        VALUES (v_meeting_id, 'Test invalid status item', 'completed_yesterday');
        RAISE EXCEPTION 'TEST 4 FAILED: Allowed insertion of an action item with an invalid status.';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'TEST 4 PASSED: Correctly blocked action item insertion with invalid status.';
    END;
END $$;

-- -------------------------------------------------------------
-- TEST 5: Cascade Deletion Verification
-- -------------------------------------------------------------
DO $$
DECLARE
    v_user_id VARCHAR(255) := 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a';
    v_meeting_count INT;
    v_transcript_count INT;
    v_summary_count INT;
    v_action_item_count INT;
    v_decision_count INT;
BEGIN
    -- Verify data exists before delete
    SELECT COUNT(*) INTO v_meeting_count FROM meetings WHERE user_id = v_user_id;
    IF v_meeting_count = 0 THEN
        RAISE EXCEPTION 'Setup verification error: No meetings seeded for test user.';
    END IF;

    -- Delete the user, which should cascade delete meetings and all child resources
    DELETE FROM users WHERE id = v_user_id;

    -- Query remaining database for cascading links
    SELECT COUNT(*) INTO v_meeting_count FROM meetings WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_transcript_count FROM transcripts WHERE meeting_id NOT IN (SELECT id FROM meetings);
    SELECT COUNT(*) INTO v_summary_count FROM summaries WHERE meeting_id NOT IN (SELECT id FROM meetings);
    SELECT COUNT(*) INTO v_action_item_count FROM action_items WHERE meeting_id NOT IN (SELECT id FROM meetings);
    SELECT COUNT(*) INTO v_decision_count FROM decisions WHERE meeting_id NOT IN (SELECT id FROM meetings);

    IF v_meeting_count = 0 AND v_transcript_count = 0 AND v_summary_count = 0 AND v_action_item_count = 0 AND v_decision_count = 0 THEN
        RAISE NOTICE 'TEST 5 PASSED: Cascading delete fully cleaned all dependent table rows (meetings, transcripts, summaries, action_items, decisions).';
    ELSE
        RAISE EXCEPTION 'TEST 5 FAILED: Orphan records detected after deleting user. Meetings:% Transcripts:% Summaries:% ActionItems:% Decisions:%',
            v_meeting_count, v_transcript_count, v_summary_count, v_action_item_count, v_decision_count;
    END IF;
END $$;

-- -------------------------------------------------------------
-- TEST 6: Index Optimization Validation (Verify Index Usage)
-- -------------------------------------------------------------
-- We can execute EXPLAIN to ensure that the planner is using indexes. 
-- For a small database, a sequential scan might be chosen, but EXPLAIN plan checks can verify the indexes exist.
DO $$
DECLARE
    v_idx_count INT;
BEGIN
    -- Ensure index on meetings (user_id) exists
    SELECT COUNT(*) INTO v_idx_count
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE t.relname = 'meetings' AND i.relname = 'idx_meetings_user_id';

    IF v_idx_count = 1 THEN
        RAISE NOTICE 'TEST 6 PASSED: Performance index idx_meetings_user_id is active.';
    ELSE
        RAISE EXCEPTION 'TEST 6 FAILED: Index idx_meetings_user_id was not found on meetings table.';
    END IF;
END $$;

-- Rollback transaction so that the verification run leaves database unchanged
ROLLBACK;
