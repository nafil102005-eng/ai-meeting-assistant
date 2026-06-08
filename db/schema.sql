-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------
-- Reusable Trigger Function for Automatic updated_at Updates
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------
-- 1. USERS TABLE (Integrated with Clerk)
-- -------------------------------------------------------------
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY, -- Maps directly to Clerk's user_id
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Trigger for users
CREATE TRIGGER update_users_modtime
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- -------------------------------------------------------------
-- 2. MEETINGS TABLE
-- -------------------------------------------------------------
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'Web Speech' NOT NULL,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    duration_seconds INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_duration CHECK (duration_seconds >= 0)
);

-- Trigger for meetings
CREATE TRIGGER update_meetings_modtime
    BEFORE UPDATE ON meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Index on user_id to optimize user-level dashboard lookups and cascades
CREATE INDEX idx_meetings_user_id ON meetings(user_id);
-- Index on meeting date for chronological list sorting
CREATE INDEX idx_meetings_date ON meetings(date DESC);

-- -------------------------------------------------------------
-- 3. TRANSCRIPTS TABLE (1-to-1 with meetings)
-- -------------------------------------------------------------
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL UNIQUE,
    raw_text TEXT NOT NULL,
    formatted_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Trigger for transcripts
CREATE TRIGGER update_transcripts_modtime
    BEFORE UPDATE ON transcripts
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Index on meeting_id (UNIQUE index is automatically created, but explicit index for consistency/cascades)
CREATE INDEX idx_transcripts_meeting_id ON transcripts(meeting_id);

-- Full-Text Search (FTS) GIN Index on raw_text for rapid keyword matching
CREATE INDEX idx_transcripts_raw_text_fts ON transcripts USING gin(to_tsvector('english', raw_text));

-- -------------------------------------------------------------
-- 4. SUMMARIES TABLE (1-to-1 with meetings)
-- -------------------------------------------------------------
CREATE TABLE summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL UNIQUE,
    summary_text TEXT NOT NULL,
    key_takeaways JSONB NOT NULL, -- Flexible structure for structured lists/bullet points
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Trigger for summaries
CREATE TRIGGER update_summaries_modtime
    BEFORE UPDATE ON summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Index on meeting_id (UNIQUE index is automatically created)
CREATE INDEX idx_summaries_meeting_id ON summaries(meeting_id);

-- -------------------------------------------------------------
-- 5. ACTION ITEMS TABLE (1-to-Many with meetings)
-- -------------------------------------------------------------
CREATE TABLE action_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    assignee VARCHAR(255),
    due_date DATE,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_action_item_status CHECK (status IN ('pending', 'in_progress', 'completed'))
);

-- Trigger for action_items
CREATE TRIGGER update_action_items_modtime
    BEFORE UPDATE ON action_items
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Index on meeting_id for cascading and parent retrieving
CREATE INDEX idx_action_items_meeting_id ON action_items(meeting_id);
-- Index on assignee for dashboard filter optimization
CREATE INDEX idx_action_items_assignee ON action_items(assignee);

-- -------------------------------------------------------------
-- 6. DECISIONS TABLE (1-to-Many with meetings)
-- -------------------------------------------------------------
CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    decider VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Trigger for decisions
CREATE TRIGGER update_decisions_modtime
    BEFORE UPDATE ON decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Index on meeting_id for cascading and parent retrieving
CREATE INDEX idx_decisions_meeting_id ON decisions(meeting_id);
