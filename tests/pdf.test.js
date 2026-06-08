import test from "node:test";
import assert from "node:assert";
import { generatePdf, sanitizeUnicode } from "../js/pdf.js";

// Setup Node.js test environment variables
process.env.NODE_ENV = "test";

test("PDF Export: Unicode sanitization normalizes non-ASCII characters", () => {
    // Test smart double and single quotes, en dash, ellipses, and accents
    const rawText = "Sarah: “Let’s verify Project Skynet’s migration—it’s crucial…” Résumé content ⚡️.";
    const cleanText = sanitizeUnicode(rawText);
    
    // Assert all smart quotes, dashes, ellipses are converted to printable ASCII
    assert.strictEqual(cleanText.includes("“"), false, "Smart double quotes should be removed.");
    assert.strictEqual(cleanText.includes("”"), false, "Smart double quotes should be removed.");
    assert.strictEqual(cleanText.includes("’"), false, "Smart single quotes should be removed.");
    assert.strictEqual(cleanText.includes("—"), false, "Em dashes should be removed.");
    assert.strictEqual(cleanText.includes("…"), false, "Ellipses should be simplified.");
    
    // Accents normalized to base characters
    assert.ok(cleanText.includes("Resume"), "Accented words like Résumé should be normalized to Resume.");
    
    // Non-ASCII symbols mapped to fallback '?'
    assert.ok(cleanText.includes("?"), "Unsupported characters like ⚡️ should be replaced with '?'.");
    
    // Verify pure ASCII character boundaries
    for (let i = 0; i < cleanText.length; i++) {
        const code = cleanText.charCodeAt(i);
        // ASCII printable codes range from 32 (space) to 126 (~), and standard whitespace controls \n, \r, \t
        const isPrintableAscii = (code >= 32 && code <= 126);
        const isWhitespace = (code === 10 || code === 13 || code === 9);
        assert.ok(isPrintableAscii || isWhitespace, `Should normalize all characters to printable ASCII: code ${code} for '${cleanText[i]}'`);
    }
});

test("PDF Export: PDF document structure generation and page-breaks", async () => {
    // Construct a mock meeting with an extremely long transcript to force multiple page additions
    const mockLongMeeting = {
        title: "Scaling Command Infrastructure Sync",
        platform: "Zoom",
        date: new Date("2026-06-08T10:00:00Z"),
        duration_seconds: 7200, // 2 hours
        summary: "Detailed overview of tactical network infrastructure migration to serverless Neon database pools.",
        actionItems: [
            { desc: "Finalize network proxy route maps", assignee: "Kyle", status: "pending" },
            { desc: "Verify database cluster constraints", assignee: "John", status: "completed" }
        ],
        decisions: [
            { desc: "Deploy automated defensive firewalls.", decider: "Sarah" }
        ],
        transcript: Array.from({ length: 150 }, (_, i) => `John Connor (Index ${i}): We must scale Node ${i} database links immediately or risk service dropouts.`).join("\n")
    };

    // Generate PDF bypassing download triggers
    const doc = await generatePdf(mockLongMeeting, { download: false });
    
    assert.ok(doc, "PDF document instance should be successfully generated.");
    
    // Verify dynamic page count. Since transcript is 150 lines, it must force page breaks.
    const numPages = doc.getNumberOfPages();
    assert.ok(numPages > 1, `PDF should automatically paginate. Total pages: ${numPages}`);
    
    // Verify we can output the document as an ArrayBuffer
    const buffer = doc.output("arraybuffer");
    assert.ok(buffer instanceof ArrayBuffer, "Should successfully export the PDF as an ArrayBuffer");
    assert.ok(buffer.byteLength > 0, "Generated ArrayBuffer should contain valid byte stream data");
});

test("PDF Export: Empty optional properties handling", async () => {
    const mockMinimalMeeting = {
        title: "Quick Scrum",
        platform: "Web Speech",
        date: new Date(),
        duration_seconds: 300,
        transcript: "Meeting transcript is short."
    };

    const doc = await generatePdf(mockMinimalMeeting, { download: false });
    assert.ok(doc);
    assert.strictEqual(doc.getNumberOfPages(), 1, "Short reports should fit within a single A4 page.");
    
    const buffer = doc.output("arraybuffer");
    assert.ok(buffer.byteLength > 0);
});
