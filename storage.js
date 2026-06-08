import pg from "pg";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const { Pool } = pg;

// Retrieve database connection strings
const connectionString = process.env.DATABASE_URL;

// Enforce SSL connection settings when connecting to Neon cloud databases
const poolConfig = {
    connectionString: connectionString,
    ssl: connectionString && (connectionString.includes("neon.tech") || connectionString.includes("localhost") === false)
        ? { rejectUnauthorized: false }
        : false,
    max: 10,                           // Connection pool capacity limit
    idleTimeoutMillis: 30000,          // Time after which idle connections are closed
    connectionTimeoutMillis: 5000      // Speed-reject database offline states (5 seconds timeout)
};

const pool = new Pool(poolConfig);

// Catch unexpected connection dropouts
pool.on("error", (err) => {
    console.error("Unexpected database pool connection dropout:", err.message);
});

/**
 * Asserts database connection health
 */
export async function testConnection() {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT NOW()");
        return !!res.rows[0];
    } finally {
        client.release();
    }
}

/**
 * Save Meeting - Atomically records meeting details, transcripts, summaries, and action plans.
 * Uses a single ACID transaction to guarantee data consistency.
 * @param {object} meeting - The complete meeting details package
 * @returns {Promise<string>} Created meeting ID
 */
export async function saveMeeting(meeting) {
    if (!meeting.user_id) {
        throw new Error("Validation Error: Missing mandatory user_id mapping.");
    }
    if (!meeting.transcript) {
        throw new Error("Validation Error: Missing mandatory meeting transcript.");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Insert Core Meeting Metadata
        const meetingQuery = `
            INSERT INTO meetings (title, platform, user_id, date, duration_seconds)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        const meetingParams = [
            meeting.title || "Untitled Sync Session",
            meeting.platform || "Web Speech",
            meeting.user_id,
            meeting.date || new Date(),
            meeting.duration_seconds || 0
        ];
        const meetingResult = await client.query(meetingQuery, meetingParams);
        const meetingId = meetingResult.rows[0].id;

        // 2. Insert Meeting Transcripts (1-to-1)
        const transcriptQuery = `
            INSERT INTO transcripts (meeting_id, raw_text, formatted_text)
            VALUES ($1, $2, $3);
        `;
        const transcriptParams = [
            meetingId,
            meeting.transcript,
            meeting.formatted_text || meeting.transcript
        ];
        await client.query(transcriptQuery, transcriptParams);

        // 3. Insert Meeting Summary (1-to-1)
        const summaryQuery = `
            INSERT INTO summaries (meeting_id, summary_text, key_takeaways)
            VALUES ($1, $2, $3);
        `;
        const summaryParams = [
            meetingId,
            meeting.summary || "Summary generation pending.",
            JSON.stringify(meeting.keyPoints || [])
        ];
        await client.query(summaryQuery, summaryParams);

        // 4. Insert Meeting Action Items (1-to-Many)
        if (meeting.actionItems && Array.isArray(meeting.actionItems)) {
            const actionQuery = `
                INSERT INTO action_items (meeting_id, description, assignee, due_date, status)
                VALUES ($1, $2, $3, $4, $5);
            `;
            for (const item of meeting.actionItems) {
                const actionParams = [
                    meetingId,
                    item.desc || item.description,
                    item.assignee || null,
                    item.due_date || null,
                    item.status || "pending"
                ];
                await client.query(actionQuery, actionParams);
            }
        }

        // 5. Insert Meeting Decisions (1-to-Many)
        if (meeting.decisions && Array.isArray(meeting.decisions)) {
            const decisionQuery = `
                INSERT INTO decisions (meeting_id, description, decider)
                VALUES ($1, $2, $3);
            `;
            for (const item of meeting.decisions) {
                const decisionParams = [
                    meetingId,
                    item.desc || item.description,
                    item.decider || "Team"
                ];
                await client.query(decisionQuery, decisionParams);
            }
        }

        await client.query("COMMIT");
        console.log(`Transaction successfully committed. Meeting saved with ID: ${meetingId}`);
        return meetingId;

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("ACID Transaction rolled back due to error:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Update Meeting - Modifies metadata (title, duration)
 */
export async function updateMeeting(meetingId, updateData) {
    const { title, duration_seconds } = updateData;

    const query = `
        UPDATE meetings 
        SET title = COALESCE($1, title), 
            duration_seconds = COALESCE($2, duration_seconds),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *;
    `;
    const result = await pool.query(query, [title, duration_seconds, meetingId]);

    if (result.rowCount === 0) {
        throw new Error(`Data Update Error: Meeting with ID ${meetingId} not found.`);
    }
    return result.rows[0];
}

/**
 * Delete Meeting - Cleans meetings table record. Cascading deletes automatically
 * wipe transcripts, summaries, action_items, and decisions.
 */
export async function deleteMeeting(meetingId) {
    const query = `
        DELETE FROM meetings 
        WHERE id = $1
        RETURNING *;
    `;
    const result = await pool.query(query, [meetingId]);

    if (result.rowCount === 0) {
        throw new Error(`Data Delete Error: Meeting with ID ${meetingId} not found.`);
    }
    return result.rows[0];
}

/**
 * Search Meetings - Filters meetings chronologically for a user
 */
export async function searchMeetings(userId, searchPattern = "") {
    const query = `
        SELECT m.id, m.title, m.platform, m.date, m.duration_seconds, s.summary_text
        FROM meetings m
        LEFT JOIN summaries s ON s.meeting_id = m.id
        WHERE m.user_id = $1 
          AND (m.title ILIKE $2 OR m.platform ILIKE $2)
        ORDER BY m.date DESC;
    `;
    const result = await pool.query(query, [userId, `%${searchPattern}%`]);
    return result.rows;
}

/**
 * Get Meeting Details - Gathers full relational details for a single meeting
 */
export async function getMeetingDetails(meetingId) {
    const meetingQuery = `
        SELECT m.id, m.title, m.platform, m.date, m.duration_seconds, m.user_id,
               t.raw_text AS transcript, s.summary_text AS summary
        FROM meetings m
        LEFT JOIN transcripts t ON t.meeting_id = m.id
        LEFT JOIN summaries s ON s.meeting_id = m.id
        WHERE m.id = $1;
    `;
    const meetingResult = await pool.query(meetingQuery, [meetingId]);
    if (meetingResult.rowCount === 0) {
        return null;
    }

    const meeting = meetingResult.rows[0];

    // Query sub-lists
    const actionsResult = await pool.query("SELECT id, description, assignee, due_date, status FROM action_items WHERE meeting_id = $1", [meetingId]);
    const decisionsResult = await pool.query("SELECT id, description, decider FROM decisions WHERE meeting_id = $1", [meetingId]);

    meeting.actionItems = actionsResult.rows;
    meeting.decisions = decisionsResult.rows;

    return meeting;
}

/**
 * getDashboardStats - Aggregates counts, recent meetings list, actions checklist, and decisions.
 * @param {string} userId - User's Clerk ID
 * @returns {Promise<object>} Compiled dashboard metrics package
 */
export async function getDashboardStats(userId) {
    // 1. Get total meetings count
    const totalMeetingsResult = await pool.query(
        "SELECT COUNT(*) AS count FROM meetings WHERE user_id = $1",
        [userId]
    );
    const totalMeetings = parseInt(totalMeetingsResult.rows[0].count, 10);

    // 2. Get action items counts categorized by status
    const actionCountsResult = await pool.query(`
        SELECT 
            COUNT(CASE WHEN ai.status = 'pending' THEN 1 END) AS pending,
            COUNT(CASE WHEN ai.status = 'in_progress' THEN 1 END) AS in_progress,
            COUNT(CASE WHEN ai.status = 'completed' THEN 1 END) AS completed
        FROM action_items ai
        JOIN meetings m ON ai.meeting_id = m.id
        WHERE m.user_id = $1;
    `, [userId]);
    
    const stats = {
        pending: parseInt(actionCountsResult.rows[0].pending || 0, 10),
        in_progress: parseInt(actionCountsResult.rows[0].in_progress || 0, 10),
        completed: parseInt(actionCountsResult.rows[0].completed || 0, 10)
    };

    // 3. Get recent meetings list (top 5 sorted chronologically)
    const recentMeetingsResult = await pool.query(`
        SELECT m.id, m.title, m.platform, m.date, m.duration_seconds, s.summary_text AS summary
        FROM meetings m
        LEFT JOIN summaries s ON s.meeting_id = m.id
        WHERE m.user_id = $1
        ORDER BY m.date DESC
        LIMIT 5;
    `, [userId]);

    // 4. Get all action items for active user
    const actionItemsResult = await pool.query(`
        SELECT ai.id, ai.description, ai.assignee, ai.due_date, ai.status, m.title AS meeting_title
        FROM action_items ai
        JOIN meetings m ON ai.meeting_id = m.id
        WHERE m.user_id = $1
        ORDER BY ai.created_at DESC;
    `, [userId]);

    // 5. Get all decisions for active user
    const decisionsResult = await pool.query(`
        SELECT d.id, d.description, d.decider, m.title AS meeting_title
        FROM decisions d
        JOIN meetings m ON d.meeting_id = m.id
        WHERE m.user_id = $1
        ORDER BY d.created_at DESC;
    `, [userId]);

    return {
        totalMeetings,
        stats,
        recentMeetings: recentMeetingsResult.rows,
        actionItems: actionItemsResult.rows,
        decisions: decisionsResult.rows
    };
}

// Export raw Pool context for advanced diagnostics/testing
export { pool };
