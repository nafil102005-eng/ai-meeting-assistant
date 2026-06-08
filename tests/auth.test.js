import test from "node:test";
import assert from "node:assert";
import http from "http";

const PORT = 3999;
let serverInstance;
let app;

// Setup test environment variables before import
process.env.NODE_ENV = "test";

// Start test server before running assertions
test.before(async () => {
    const serverModule = await import("../server.js");
    app = serverModule.default;
    return new Promise((resolve) => {
        serverInstance = app.listen(PORT, () => {
            console.log(`Test server initialized on port ${PORT}`);
            resolve();
        });
    });
});

// Tear down test server after running assertions
test.after(() => {
    return new Promise((resolve) => {
        serverInstance.close(() => {
            console.log("Test server shutdown complete.");
            resolve();
        });
    });
});

/**
 * Helper to perform HTTP GET requests against the local test server
 */
function fetchTestRoute(path, token = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: "localhost",
            port: PORT,
            path: path,
            method: "GET",
            headers: {}
        };

        if (token) {
            options.headers["Authorization"] = `Bearer ${token}`;
        }

        const req = http.request(options, (res) => {
            let body = "";
            res.on("data", (chunk) => body += chunk);
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body ? JSON.parse(body) : null
                });
            });
        });

        req.on("error", (err) => reject(err));
        req.end();
    });
}

// -------------------------------------------------------------
// TEST CASE 1: Unauthorized Access (No Auth Header)
// -------------------------------------------------------------
test("API Protection: Reject requests without authorization header with 401", async () => {
    const response = await fetchTestRoute("/api/meetings");
    assert.strictEqual(response.statusCode, 401);
    assert.ok(response.body.error.includes("Missing or invalid authorization header"));
});

// -------------------------------------------------------------
// TEST CASE 2: Invalid / Expired Session Token (Tampered Token)
// -------------------------------------------------------------
test("API Protection: Reject invalid session token signatures with 401", async () => {
    const response = await fetchTestRoute("/api/meetings", "mock_invalid_token");
    assert.strictEqual(response.statusCode, 401);
    assert.ok(response.body.error.includes("Invalid signature"));
});

// -------------------------------------------------------------
// TEST CASE 3: Session Expiration Verification
// -------------------------------------------------------------
test("API Protection: Reject expired session tokens with 401", async () => {
    const response = await fetchTestRoute("/api/meetings", "mock_expired_token");
    assert.strictEqual(response.statusCode, 401);
    assert.ok(response.body.error.includes("Session expired"));
});

// -------------------------------------------------------------
// TEST CASE 4: Authorized Access Flow (Valid Token)
// -------------------------------------------------------------
test("API Protection: Approve requests with valid signatures and session claims with 200", async () => {
    const response = await fetchTestRoute("/api/meetings", "mock_valid_token_sarah");
    assert.strictEqual(response.statusCode, 200);
    assert.ok(Array.isArray(response.body));
    assert.strictEqual(response.body[0].user_id, "user_2NizH1J8mQ4bLm93rP8oWqK8z1a");
});
