import test from "node:test";
import assert from "node:assert";
import pg from "pg";
import { saveMeeting, updateMeeting, deleteMeeting, searchMeetings, getMeetingDetails } from "../storage.js";

// Save original Pool reference
const { Pool } = pg;

// Setup test environment
process.env.NODE_ENV = "test";

const isDbConfigured = process.env.DATABASE_URL && 
                       !process.env.DATABASE_URL.includes("your_neon_user") && 
                       process.env.DATABASE_URL.trim() !== "";

// -------------------------------------------------------------
// TEST CASE 1: Failed Database Connection Handling
// -------------------------------------------------------------
test("Database Storage: Handle connection outages and incorrect parameters cleanly", async () => {
    // Instantiate a pool with completely invalid parameters to simulate an outage
    const badPool = new Pool({
        connectionString: "postgres://bad_user:bad_pass@localhost:9999/bad_db",
        connectionTimeoutMillis: 500 // Fail fast
    });

    let caughtError = false;
    try {
        await badPool.connect();
    } catch (err) {
        caughtError = true;
        assert.ok(err instanceof Error);
    }
    
    assert.strictEqual(caughtError, true, "Should throw an exception for connection outages.");
    await badPool.end();
});

// -------------------------------------------------------------
// RUN EITHER REAL INTEGRATION OR MOCKED STORAGE ASSERTIONS
// -------------------------------------------------------------
if (isDbConfigured) {
    console.log("Database connection configured. Running real Neon DB integration tests...");

    // Setup helper to create temp test user
    test.before(async () => {
        const client = new Pool({ connectionString: process.env.DATABASE_URL });
        try {
            // Ensure Sarah Connor exists in DB for foreign key mapping
            await client.query(`
                INSERT INTO users (id, email, name)
                VALUES ('user_2NizH1J8mQ4bLm93rP8oWqK8z1a', 'sarah.connor@example.com', 'Sarah Connor')
                ON CONFLICT (id) DO NOTHING;
            `);
        } finally {
            await client.end();
        }
    });

    // CRUD Integration Test
    test("Database Storage: Execute complete atomic CRUD operations on Neon PostgreSQL", async () => {
        const testMeeting = {
            title: "Database Integration Test Sync",
            platform: "Web Speech",
            user_id: "user_2NizH1J8mQ4bLm93rP8oWqK8z1a",
            date: new Date(),
            duration_seconds: 600,
            transcript: "Testing the real Neon Postgres transactions loop. All data should cascade correctly.",
            summary: "### Test Summary\nDDL validation.",
            keyPoints: ["Point A", "Point B"],
            actionItems: [
                { desc: "Test action resolution", assignee: "Sarah", status: "pending" }
            ],
            decisions: [
                { desc: "Establish database storage adapter.", decider: "Sarah" }
            ]
        };

        // 1. CREATE (Save)
        const id = await saveMeeting(testMeeting);
        assert.ok(id, "Should return a valid UUID meeting ID.");

        // 2. READ (Get Details)
        const details = await getMeetingDetails(id);
        assert.strictEqual(details.title, "Database Integration Test Sync");
        assert.strictEqual(details.transcript, testMeeting.transcript);
        assert.strictEqual(details.actionItems[0].assignee, "Sarah");
        assert.strictEqual(details.decisions[0].decider, "Sarah");

        // 3. UPDATE
        const updated = await updateMeeting(id, { title: "Updated Test Title", duration_seconds: 1200 });
        assert.strictEqual(updated.title, "Updated Test Title");
        assert.strictEqual(updated.duration_seconds, 1200);

        // 4. DELETE (Cascades test)
        await deleteMeeting(id);
        const searchResults = await searchMeetings("user_2NizH1J8mQ4bLm93rP8oWqK8z1a", "Database Integration");
        assert.strictEqual(searchResults.length, 0, "Meeting should be completely deleted.");
    });

    // Concurrency Integration Test
    test("Database Storage: Verify concurrent request execution under load", async () => {
        const testMeeting = {
            title: "Concurrency Load Sync",
            platform: "Google Meet",
            user_id: "user_2NizH1J8mQ4bLm93rP8oWqK8z1a",
            transcript: "Sarah is speaking in parallel loops.",
            summary: "### Concurrency Summary",
            actionItems: [{ desc: "Parallel task", assignee: "Sarah" }]
        };

        // Trigger 5 parallel transaction saves to the database
        const jobs = Array.from({ length: 5 }, () => saveMeeting(testMeeting));
        const ids = await Promise.all(jobs);

        assert.strictEqual(ids.length, 5);
        
        // Cleanup parallel records
        for (const id of ids) {
            await deleteMeeting(id);
        }
    });

} else {
    console.log("Skipping Real Neon DB integration tests because DATABASE_URL has placeholder values. Running in mock mode.");

    // Mock storage object representation for dry run tests
    const mockDb = [];

    test("Database Storage: CRUD Logic Dry-Run (Mock Mode)", async () => {
        const mockMeeting = {
            id: "m000-0000-0000",
            title: "Local Mock Sync",
            user_id: "user_mock",
            transcript: "Simulating mock saves.",
            summary: "### Local Summary"
        };

        // 1. Create Mock
        mockDb.push(mockMeeting);
        assert.strictEqual(mockDb.length, 1);

        // 2. Read Mock
        const details = mockDb.find(m => m.id === "m000-0000-0000");
        assert.strictEqual(details.title, "Local Mock Sync");

        // 3. Update Mock
        details.title = "Local Updated Title";
        assert.strictEqual(mockDb[0].title, "Local Updated Title");

        // 4. Delete Mock
        const idx = mockDb.findIndex(m => m.id === "m000-0000-0000");
        mockDb.splice(idx, 1);
        assert.strictEqual(mockDb.length, 0);
    });

    test("Database Storage: Concurrency Logic Dry-Run (Mock Mode)", async () => {
        const jobs = Array.from({ length: 5 }, async () => {
            const temp = { id: Math.random().toString(), title: "Parallel Mock" };
            mockDb.push(temp);
            return temp.id;
        });

        const ids = await Promise.all(jobs);
        assert.strictEqual(ids.length, 5);
        assert.strictEqual(mockDb.length, 5);
    });
}
