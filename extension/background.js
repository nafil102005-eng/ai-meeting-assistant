/**
 * AI Meeting Assistant - Background Service Worker
 * Coordinates offscreen speech capture documents and handles backend API proxies.
 */

let recordingStartTime = null;
let recordingTabId = null;

// --- API Configuration ---
const PRODUCTION_URL = "https://ai-meeting-assistant-seven.vercel.app";
// Service workers do not have a location object, so checking for localhost fails. 
// Always route requests to the deployed backend server.
const API_BASE_URL = PRODUCTION_URL;

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
 * Commences recording session by injecting the capture script into the active tab
 */
async function startRecordingSession() {
    recordingStartTime = Date.now();
    await chrome.storage.local.set({ isRecording: true, summary: "", recordingStartTime });
    
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("chrome-extension://")) {
        throw new Error("Cannot record on this page. Please switch to a regular website.");
    }
    
    recordingTabId = activeTab.id;
    await chrome.scripting.executeScript({
        target: { tabId: recordingTabId },
        files: ["content.js"]
    });
    console.log("Recording content script injected.");
}

/**
 * Concludes recording session, stopping the capture script
 */
async function stopRecordingSession() {
    await chrome.storage.local.set({ isRecording: false });
    if (recordingTabId) {
        try {
            await chrome.tabs.sendMessage(recordingTabId, { action: "STOP_VOICE_CAPTURE" });
        } catch (e) {
            console.warn("Could not send stop message to tab:", e);
        }
        recordingTabId = null;
    }
    console.log("Recording stopped.");
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
        const { transcript, recordingStartTime: storedStartTime } = await chrome.storage.local.get(["transcript", "recordingStartTime"]);
        if (!transcript || transcript.trim().length < 20) {
            throw new Error("Transcript is too short to generate a summary (min 20 characters).");
        }

        const token = await fetchClerkToken();
        const durationSecs = storedStartTime ? Math.round((Date.now() - storedStartTime) / 1000) : 60;

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
