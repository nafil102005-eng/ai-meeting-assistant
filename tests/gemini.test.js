import test from "node:test";
import assert from "node:assert";
import { analyzeTranscript } from "../gemini.js";

// Save original global fetch to restore after tests
const originalFetch = global.fetch;

// Setup test environment
process.env.NODE_ENV = "test";

// -------------------------------------------------------------
// TEST CASE 1: Empty / Malformed Transcript Handling
// -------------------------------------------------------------
test("Gemini Service: Reject empty or extremely short inputs without making network calls", async () => {
    // Should reject immediately via validation guard checks
    await assert.rejects(
        async () => {
            await analyzeTranscript("Short");
        },
        /Validation Error/
    );

    await assert.rejects(
        async () => {
            await analyzeTranscript("   ");
        },
        /Validation Error/
    );
});

// -------------------------------------------------------------
// TEST CASE 2: API Outages and Key Failure Recovery
// -------------------------------------------------------------
test("Gemini Service: Gracefully return formatted fallback template upon API failures", async () => {
    // Stub global fetch to simulate a complete API failure (HTTP 500)
    global.fetch = async () => {
        return {
            ok: false,
            status: 500,
            text: async () => "Internal Server Error Simulation"
        };
    };

    const mockTranscript = "Sarah: We need to coordinate the server launch. Bob: I will test the routes. Alice: I will verify index.html links.";
    const analysis = await analyzeTranscript(mockTranscript);

    assert.ok(analysis.summary.includes("Analysis Blocked"));
    assert.strictEqual(analysis.actionItems[0].assignee, "Developer");
    assert.strictEqual(analysis.decisions[0].decider, "System");

    // Restore fetch
    global.fetch = originalFetch;
});

// -------------------------------------------------------------
// TEST CASE 3: Rate Limiting & Back-off Retry Verification
// -------------------------------------------------------------
test("Gemini Service: Execute exponential retries on HTTP 429 rate limit triggers", async () => {
    let callCount = 0;

    // Stub fetch to return 429 twice, then return a valid payload on the 3rd attempt
    global.fetch = async () => {
        callCount++;
        if (callCount < 3) {
            return {
                ok: false,
                status: 429,
                text: async () => "Rate Limit Exceeded"
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify({
                                summary: "### Summary\nRate limits resolved on third attempt.",
                                keyPoints: ["System resolved 429 state."],
                                actionItems: [],
                                decisions: [],
                                followUps: []
                            })
                        }]
                    }
                }]
            })
        };
    };

    const mockTranscript = "Sarah: We need to coordinate the server launch. Bob: I will test the routes. Alice: I will verify index.html links.";
    
    // Call the analyzer (configure initial delay short to prevent slow tests)
    const analysis = await analyzeTranscript(mockTranscript);
    
    assert.strictEqual(callCount, 3, "The fetch service should retry exactly 3 times before succeeding.");
    assert.ok(analysis.summary.includes("Rate limits resolved"));

    // Restore fetch
    global.fetch = originalFetch;
});

// -------------------------------------------------------------
// TEST CASE 4: Verification of Response Quality (Integration Test)
// -------------------------------------------------------------
test("Gemini Service: Verify real integration analysis on short, medium, and long transcripts", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes("xxxxxxxx") || apiKey.trim() === "") {
        console.log("Skipping Real Gemini API Integration test: No valid GEMINI_API_KEY detected.");
        return;
    }

    const shortTranscript = "John: We need to buy a new whiteboard for command room. Kyle: Sure John, I can check office supplies store tomorrow and buy it.";
    
    const mediumTranscript = `
    Sarah: Let's synchronize on the Q3 Marketing launch calendar. We have multiple deliverables.
    Bob: I'm finalizing the advertising copies. They'll be ready for your review by Friday evening.
    Alice: I've started the layout wireframes. I should have the initial design proposals prepared by next Monday.
    Sarah: Excellent. I'll increase our LinkedIn budget by 50% to align with this campaign.
    `;

    const longTranscript = `
    John: Welcome team to the core database review. We are currently facing serious command infrastructure bottlenecks.
    Kyle: The central server is hitting connection thresholds. I suggest migrating our static SQL database to Neon serverless pools.
    Sarah: What about transaction security? We need to keep environment config credentials highly secure.
    John: Yes, we must encrypt all API credentials in a secure vault environment.
    Kyle: I can write the migration scripts. We should aim to test the transition sequence by Wednesday.
    Sarah: I will audit the firewall and verify that Neon's port 6543 handles pooled connections properly.
    John: Let's lock this in. Database migration goes live on Friday.
    `;

    // 1. Validate Short Transcript Output
    console.log("Analyzing short transcript...");
    const shortAnalysis = await analyzeTranscript(shortTranscript);
    assert.ok(shortAnalysis.summary, "Short analysis should contain a summary.");
    assert.ok(Array.isArray(shortAnalysis.actionItems), "Action items should be an array.");
    assert.ok(shortAnalysis.actionItems.length > 0, "Should extract action items.");

    // 2. Validate Medium Transcript Output
    console.log("Analyzing medium transcript...");
    const mediumAnalysis = await analyzeTranscript(mediumTranscript);
    assert.ok(mediumAnalysis.summary, "Medium analysis should contain a summary.");
    assert.ok(mediumAnalysis.keyPoints.length > 0, "Should extract key points.");

    // 3. Validate Long Transcript Output
    console.log("Analyzing long transcript...");
    const longAnalysis = await analyzeTranscript(longTranscript);
    assert.ok(longAnalysis.summary, "Long analysis should contain a summary.");
    assert.ok(longAnalysis.decisions.length > 0, "Should extract key decisions.");
    assert.ok(longAnalysis.followUps.length > 0, "Should extract follow-up suggestions.");
});
