import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

/**
 * Helper delay function
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Performs a fetch request to Gemini API with exponential back-off retries for rate limits (429)
 */
async function fetchWithRetry(url, options, maxRetries = 3, initialDelayMs = 2000) {
    let currentDelay = initialDelayMs;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);

            // Handle rate limits (HTTP 429) via retry back-off loop
            if (res.status === 429) {
                if (attempt === maxRetries) {
                    throw new Error(`Gemini API rate limit exceeded. Failed after ${maxRetries} attempts.`);
                }
                console.warn(`Gemini API returned 429. Attempt ${attempt} of ${maxRetries}. Retrying in ${currentDelay}ms...`);
                await delay(currentDelay);
                currentDelay *= 2; // Exponential back-off multiplier
                continue;
            }

            // Return response immediately for other outcomes
            return res;
        } catch (err) {
            if (attempt === maxRetries) {
                throw err;
            }
            console.warn(`Connection error on attempt ${attempt}: ${err.message}. Retrying...`);
            await delay(currentDelay);
            currentDelay *= 2;
        }
    }
}

/**
 * Enforces structured JSON summaries from transcripts using Gemini 1.5 Flash
 * @param {string} transcriptText - Raw text to analyze
 * @returns {Promise<object>} Parsed analytical results
 */
export async function analyzeTranscript(transcriptText) {
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. Empty/Malformed Transcript Guard
    if (!transcriptText || typeof transcriptText !== "string" || transcriptText.trim().length < 20) {
        throw new Error("Validation Error: Transcript text must contain at least 20 characters.");
    }

    if (!apiKey || apiKey.includes("xxxxxxxx")) {
        console.error("Gemini API key is unconfigured or contains placeholder values.");
        return getFallbackPayload("API key config missing. Please set GEMINI_API_KEY.");
    }

    // JSON Schema enforcing format requirements directly from Gemini engine
    const responseSchema = {
        type: "OBJECT",
        properties: {
            summary: { 
                type: "STRING", 
                description: "A comprehensive markdown executive summary of the meeting details." 
            },
            keyPoints: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "Bullet point list summarizing core topics discussed."
            },
            actionItems: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        desc: { type: "STRING", description: "Action detail task." },
                        assignee: { type: "STRING", description: "Person assigned, or 'Unassigned'." }
                    },
                    required: ["desc", "assignee"]
                },
                description: "Task delegations extracted from transcript."
            },
            decisions: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        desc: { type: "STRING", description: "Details of choice made." },
                        decider: { type: "STRING", description: "Who decided, or 'Team'." }
                    },
                    required: ["desc", "decider"]
                },
                description: "Conclusive key decisions made."
            },
            followUps: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "List of future check-ins or follow-up recommendations."
            }
        },
        required: ["summary", "keyPoints", "actionItems", "decisions", "followUps"]
    };

    const requestBody = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `You are an expert meeting analyst. Carefully read the following meeting transcript. Generate a structured summary report containing an executive summary, key points discussed, action items with assignees, conclusive decisions made, and follow-up recommendations. Here is the transcript:\n\n${transcriptText}`
                    }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.2
        }
    };

    try {
        const response = await fetchWithRetry(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini Server Error (Status ${response.status}): ${errBody}`);
        }

        const data = await response.json();
        
        // Extract raw JSON string from candidate text output
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawJsonText) {
            throw new Error("No structured output candidate text returned by Gemini.");
        }

        // Parse matching schema directly
        return JSON.parse(rawJsonText);

    } catch (error) {
        console.error("Failed executing analyzeTranscript via Gemini API:", error.message);
        // Fallback to structured templates in case of API outages/limits
        return getFallbackPayload(`API Connection failure: ${error.message}`);
    }
}

/**
 * Standardized fallback configuration payload
 */
function getFallbackPayload(errorMessage) {
    return {
        summary: `### Analysis Blocked\nFailed to summarize transcript. Error: ${errorMessage}`,
        keyPoints: [
            "Analysis connection lost.",
            "Please check API indicators or environment credentials."
        ],
        actionItems: [
            { desc: "Audit and verify backend API configuration", assignee: "Developer" }
        ],
        decisions: [
            { desc: "Default to offline fallback template.", decider: "System" }
        ],
        followUps: [
            "Re-run meeting analyzer once connectivity is restored."
        ]
    };
}
