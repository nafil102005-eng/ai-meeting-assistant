/**
 * AI Meeting Assistant - Background Service Worker
 * Coordinates offscreen speech capture documents and handles backend API proxies.
 */

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
let isCreatingDocument = null; // Lock to prevent concurrent offscreen creation calls
let recordingStartTime = null;

// --- API Configuration ---
// Switch between local dev server and the Vercel production deployment.
// Update PRODUCTION_URL to your actual Vercel deployment URL after deploying.
const PRODUCTION_URL = "https://ai-meeting-assistant.vercel.app";
const API_BASE_URL = (typeof location !== "undefined" && location.hostname === "localhost")
    ? "http://localhost:3000"
    : PRODUCTION_URL;

// Initialize state parameters on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        isRecording: false,
        transcript: "",
        summary: "",
        isSummarizing: false
    });
    console.log("AI Meeting Assistant Extension initialized.");
});

// Message Routing Controller
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_RECORDING") {
        startRecordingSession()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ error: err.message }));
        return true; // Keep message channel open for async response
    }

    if (message.action === "STOP_RECORDING") {
        stopRecordingSession()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ error: err.message }));
        return true;
    }

    if (message.action === "TRANSCRIPT_UPDATE") {
        // Direct transcript segment update from the offscreen capture script
        chrome.storage.local.set({ transcript: message.text });
        return false;
    }

    if (message.action === "SUMMARIZE_MEETING") {
        generateSummaryAndSave()
            .then((result) => sendResponse({ success: true, summary: result }))
            .catch((err) => sendResponse({ error: err.message }));
        return true;
    }
});

/**
 * Commences recording session, creating the offscreen capture DOM document
 */
async function startRecordingSession() {
    recordingStartTime = Date.now();
    await chrome.storage.local.set({ isRecording: true, summary: "" });
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
}

/**
 * Concludes recording session, tearing down the offscreen document and saving duration
 */
async function stopRecordingSession() {
    await chrome.storage.local.set({ isRecording: false });
    await closeOffscreenDocument();
}

/**
 * Creates offscreen document helper context safely if it does not already exist
 */
async function setupOffscreenDocument(path) {
    // Check if document already exists
    if (await hasOffscreenDocument()) {
        return;
    }

    if (isCreatingDocument) {
        await isCreatingDocument;
        return;
    }

    isCreatingDocument = chrome.offscreen.createDocument({
        url: path,
        reasons: ["USER_MEDIA"], // Requesting access to user microphone
        justification: "Continuous voice recording and transcribing of meetings."
    });

    await isCreatingDocument;
    isCreatingDocument = null;
    console.log("Offscreen recording document mounted.");
}

/**
 * Closes the active offscreen document securely
 */
async function closeOffscreenDocument() {
    if (!(await hasOffscreenDocument())) {
        return;
    }
    await chrome.offscreen.closeDocument();
    console.log("Offscreen recording document dismounted.");
}

/**
 * Asserts if offscreen document is currently mounted
 */
async function hasOffscreenDocument() {
    if (chrome.offscreen.hasDocument) {
        return await chrome.offscreen.hasDocument();
    }
    // Fallback context validation for older browsers or environments
    const matchedClients = await clients.matchAll({
        type: "window"
    });
    return matchedClients.some(c => c.url.includes(OFFSCREEN_DOCUMENT_PATH));
}

/**
 * Dynamically queries active localhost tab to extract Clerk user session tokens
 */
async function fetchClerkToken() {
    try {
        // Query both localhost (dev) and production Vercel tabs for Clerk session
        const [localTabs, prodTabs] = await Promise.all([
            chrome.tabs.query({ url: "*://localhost/*" }),
            chrome.tabs.query({ url: `${PRODUCTION_URL}/*` })
        ]);
        const tabs = [...localTabs, ...prodTabs];

        if (!tabs || tabs.length === 0) {
            throw new Error("No active web application tab found. Please open the app and log in first.");
        }

        // Target the first matching tab to execute script context
        const targetTab = tabs[0];
        const scriptResult = await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            func: () => {
                if (window.Clerk && window.Clerk.session) {
                    return window.Clerk.session.getToken();
                }
                return null;
            }
        });

        const token = scriptResult[0]?.result;
        if (!token) {
            throw new Error("User session not found. Please log in to the web application first.");
        }
        return token;
    } catch (e) {
        console.warn("Failed retrieving Clerk token via tab scripting:", e.message);
        throw new Error("Could not get auth token. Open the app in a tab and log in first.");
    }
}

/**
 * Connects with local Express server, saves meeting data, and updates summary text
 */
async function generateSummaryAndSave() {
    await chrome.storage.local.set({ isSummarizing: true });

    try {
        const { transcript } = await chrome.storage.local.get("transcript");
        if (!transcript || transcript.trim().length < 20) {
            throw new Error("Transcript is too short to generate a summary (min 20 characters).");
        }

        const token = await fetchClerkToken();
        const durationSecs = recordingStartTime ? Math.round((Date.now() - recordingStartTime) / 1000) : 60;

        const response = await fetch(`${API_BASE_URL}/api/meetings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                title: "Extension Meeting Sync",
                platform: "Browser Extension",
                duration_seconds: durationSecs,
                transcript: transcript
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Server responded with status code: ${response.status}`);
        }

        await chrome.storage.local.set({
            summary: result.summary,
            isSummarizing: false
        });

        return result.summary;

    } catch (err) {
        console.error("Extension summarization failure:", err);
        await chrome.storage.local.set({ isSummarizing: false });
        throw err;
    }
}
