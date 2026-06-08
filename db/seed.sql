-- -------------------------------------------------------------
-- SEED DATA FOR AI MEETING ASSISTANT
-- -------------------------------------------------------------

-- Clear existing data (in case script is run repeatedly during dev/test)
TRUNCATE TABLE decisions, action_items, summaries, transcripts, meetings, users CASCADE;

-- 1. Seed Users (using Clerk format IDs)
INSERT INTO users (id, email, name) VALUES
('user_2NizH1J8mQ4bLm93rP8oWqK8z1a', 'sarah.connor@example.com', 'Sarah Connor'),
('user_2NizK2K9nS5cMn04sQ9pXrL9z2b', 'john.connor@example.com', 'John Connor');

-- 2. Seed Meetings for User 1 (Sarah Connor)
-- Meeting A: Marketing Sprint
INSERT INTO meetings (id, user_id, title, platform, date, duration_seconds) VALUES
('a0000000-0000-0000-0000-000000000001', 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a', 'Q3 Marketing Alignment', 'Google Meet', NOW() - INTERVAL '2 days', 1800),
('a0000000-0000-0000-0000-000000000002', 'user_2NizH1J8mQ4bLm93rP8oWqK8z1a', 'Project Skynet Launch Sync', 'Web Speech', NOW() - INTERVAL '1 day', 2400);

-- Meeting B: Tech Sync for User 2 (John Connor)
INSERT INTO meetings (id, user_id, title, platform, date, duration_seconds) VALUES
('b0000000-0000-0000-0000-000000000001', 'user_2NizK2K9nS5cMn04sQ9pXrL9z2b', 'Resistance Core Infrastructure Review', 'Zoom', NOW() - INTERVAL '5 hours', 3600);

-- 3. Seed Transcripts
-- Transcript for Meeting A1 (Marketing)
INSERT INTO transcripts (meeting_id, raw_text, formatted_text) VALUES
('a0000000-0000-0000-0000-000000000001', 
 'Sarah: Welcome everyone. Today we are launching the Q3 campaigns. We need the assets ready by next Monday. Bob: I can finalize the copy by Friday afternoon. Sarah: Great, Alice will handle graphic designs. We want to double our budget for LinkedIn ads.', 
 'Sarah: Welcome everyone. Today we are launching the Q3 campaigns. We need the assets ready by next Monday.<br>Bob: I can finalize the copy by Friday afternoon.<br>Sarah: Great, Alice will handle graphic designs. We want to double our budget for LinkedIn ads.');

-- Transcript for Meeting A2 (Skynet Launch Sync)
INSERT INTO transcripts (meeting_id, raw_text, formatted_text) VALUES
('a0000000-0000-0000-0000-000000000002', 
 'Sarah: The automated defensive network launch is scheduled. We must ensure security filters are active. John: I feel we should delay. The AI model is too autonomous. Sarah: No, we proceed with deployment tomorrow. Security is fully parameterized.', 
 'Sarah: The automated defensive network launch is scheduled. We must ensure security filters are active.<br>John: I feel we should delay. The AI model is too autonomous.<br>Sarah: No, we proceed with deployment tomorrow. Security is fully parameterized.');

-- Transcript for Meeting B1 (Infrastructure)
INSERT INTO transcripts (meeting_id, raw_text, formatted_text) VALUES
('b0000000-0000-0000-0000-000000000001', 
 'John: Our central command node is bottlenecked. We need to transition to Neon serverless pools. Kyle: I can write the migration scripts. We should also encrypt the communication keys in vault. John: Perfect, let''s aim for complete migration by Friday.',
 'John: Our central command node is bottlenecked. We need to transition to Neon serverless pools.<br>Kyle: I can write the migration scripts. We should also encrypt the communication keys in vault.<br>John: Perfect, let''s aim for complete migration by Friday.');

-- 4. Seed Summaries
-- Summary for Meeting A1
INSERT INTO summaries (meeting_id, summary_text, key_takeaways) VALUES
('a0000000-0000-0000-0000-000000000001', 
 '### Q3 Marketing Campaign Prep\nThe meeting focused on organizing deliverables for the upcoming Q3 campaign launch, allocating asset generation tasks, and establishing budget adjustments.',
 '["Deliver assets by Monday", "Complete copy by Friday afternoon", "Double budget for LinkedIn advertisements"]'::jsonb);

-- Summary for Meeting A2
INSERT INTO summaries (meeting_id, summary_text, key_takeaways) VALUES
('a0000000-0000-0000-0000-000000000002', 
 '### Skynet Core Launch Alignment\nHigh-stakes alignment on the network launch. Despite some concerns regarding AI autonomy, the deployment is confirmed to proceed as planned with verified safety filters.',
 '["Deployment proceed tomorrow", "Ensure all safety security filters are operational", "Reject delay proposals"]'::jsonb);

-- Summary for Meeting B1
INSERT INTO summaries (meeting_id, summary_text, key_takeaways) VALUES
('b0000000-0000-0000-0000-000000000001', 
 '### Core Infrastructure Optimization\nTechnical review focused on solving network bottlenecks by migrating to Neon PostgreSQL serverless connection pools and encrypting environment secret keys.',
 '["Migrate command node database to Neon PostgreSQL serverless", "Implement secure key encryption in vault", "Complete database migration by Friday"]'::jsonb);

-- 5. Seed Action Items
-- Action Items for Meeting A1
INSERT INTO action_items (meeting_id, description, assignee, due_date, status) VALUES
('a0000000-0000-0000-0000-000000000001', 'Finalize advertising ad copy assets', 'Bob', CURRENT_DATE + 3, 'in_progress'),
('a0000000-0000-0000-0000-000000000001', 'Create social graphics layouts', 'Alice', CURRENT_DATE + 6, 'pending');

-- Action Items for Meeting A2
INSERT INTO action_items (meeting_id, description, assignee, due_date, status) VALUES
('a0000000-0000-0000-0000-000000000002', 'Activate and test network security filters', 'Sarah', CURRENT_DATE + 1, 'in_progress');

-- Action Items for Meeting B1
INSERT INTO action_items (meeting_id, description, assignee, due_date, status) VALUES
('b0000000-0000-0000-0000-000000000001', 'Develop and test migration scripts for Neon PostgreSQL', 'Kyle', CURRENT_DATE + 4, 'pending'),
('b0000000-0000-0000-0000-000000000001', 'Encrypt and store environment config keys', 'John', CURRENT_DATE + 2, 'completed');

-- 6. Seed Decisions
-- Decisions for Meeting A1
INSERT INTO decisions (meeting_id, description, decider) VALUES
('a0000000-0000-0000-0000-000000000001', 'Double the budget allocation for LinkedIn social advertisements.', 'Sarah');

-- Decisions for Meeting A2
INSERT INTO decisions (meeting_id, description, decider) VALUES
('a0000000-0000-0000-0000-000000000002', 'Deploy defensive network on schedule despite objections.', 'Sarah');

-- Decisions for Meeting B1
INSERT INTO decisions (meeting_id, description, decider) VALUES
('b0000000-0000-0000-0000-000000000001', 'Transition database from traditional local VM postgres to serverless Neon connection pool.', 'John');
