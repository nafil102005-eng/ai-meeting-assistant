/**
 * AI Meeting Assistant - Popup Controller Script
 * Communicates with the background service worker and renders current state.
 */

document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");
    const stopBtn = document.getElementById("stop-btn");
    const summarizeBtn = document.getElementById("summarize-btn");
    const transcriptBox = document.getElementById("transcript-box");
    const charCount = document.getElementById("char-count");
    const statusText = document.getElementById("status-text");
    const statusIndicator = document.getElementById("status-indicator");
    const summaryPanel = document.getElementById("summary-panel");
    const summaryContent = document.getElementById("summary-content");

    // 1. Fetch initial state from persistent local storage
    chrome.storage.local.get(["isRecording", "transcript", "summary", "isSummarizing"], (state) => {
        updateUIState(state);
    });

    // 2. Set up real-time listener for storage changes (updates transcript as we speak!)
    chrome.storage.onChanged.addListener((changes) => {
        // Fetch the full state instead of relying on partial updates to avoid UI desync
        chrome.storage.local.get(["isRecording", "transcript", "summary", "isSummarizing"], (state) => {
            updateUIState(state);
        });
    });

    // 3. Button Action Listeners
    startBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "START_RECORDING" }, (response) => {
            if (response && response.error) {
                console.error("Failed to start recording:", response.error);
                alert("Recording Error: " + response.error);
            }
        });
    });

    stopBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "STOP_RECORDING" }, (response) => {
            if (response && response.error) {
                console.error("Failed to stop recording:", response.error);
            }
        });
    });

    summarizeBtn.addEventListener("click", () => {
        // Show summary panel loader state
        summaryPanel.style.display = "block";
        summaryContent.textContent = "Connecting to backend server and generating summary...";
        summarizeBtn.disabled = true;

        chrome.runtime.sendMessage({ action: "SUMMARIZE_MEETING" }, (response) => {
            if (response && response.error) {
                summaryContent.textContent = "Error: " + response.error;
                summarizeBtn.disabled = false;
            }
        });
    });

    /**
     * Renders controls, transcripts, and status tags depending on storage state payload
     * @param {object} state - Storage state slices
     */
    function updateUIState(state) {
        // Update recording state parameters
        if (state.isRecording !== undefined) {
            if (state.isRecording) {
                statusText.textContent = "Recording";
                statusIndicator.className = "status-dot active";
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                statusText.textContent = "Idle";
                statusIndicator.className = "status-dot";
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
        }

        // Update transcript block content
        if (state.transcript !== undefined) {
            const rawText = state.transcript.trim();
            if (rawText.length > 0) {
                transcriptBox.textContent = rawText;
                charCount.textContent = `${rawText.length} chars`;
                // Enable summarize button if transcript is long enough
                summarizeBtn.disabled = rawText.length < 20 || (state.isRecording ?? false);
            } else {
                transcriptBox.textContent = "Click Record to start capturing meeting audio...";
                charCount.textContent = "0 chars";
                summarizeBtn.disabled = true;
            }
        }

        // Update active summarization loaders
        if (state.isSummarizing !== undefined) {
            if (state.isSummarizing) {
                summaryPanel.style.display = "block";
                summaryContent.textContent = "Running AI analytical mapping inside Gemini engine...";
                summarizeBtn.disabled = true;
            }
        }

        // Update finalized summaries
        if (state.summary !== undefined) {
            if (state.summary && state.summary.length > 0) {
                summaryPanel.style.display = "block";
                summaryContent.innerHTML = formatSummary(state.summary);
                summarizeBtn.disabled = false;
            } else {
                summaryPanel.style.display = "none";
            }
        }
    }

    /**
     * Basic formatting utility to display linebreaks and bold text inside popup summary
     * @param {string} text - Raw Markdown/text summary
     * @returns {string} Styled HTML
     */
    function formatSummary(text) {
        if (!text) return "";
        return text
            .replace(/###\s+(.*)/g, '<h4 style="color:var(--accent-color); margin-top:0.4rem; font-weight:600;">$1</h4>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }
});
