/**
 * AI Meeting Assistant - Offscreen Voice Capture Script
 * Runs inside the offscreen document DOM context to execute continuous speech recognition.
 */

let recognition = null;
let fullTranscript = "";
let isRecordingActive = true;

/**
 * Asserts microphone permissions and initiates the SpeechRecognition listener loops
 */
async function startVoiceCapture() {
    try {
        // Trigger microphone media permission checks (forces browser prompt if not already approved)
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            throw new Error("SpeechRecognition API is not supported by this browser engine.");
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        // Handle recognized voice outputs
        recognition.onresult = (event) => {
            let segment = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    segment += event.results[i][0].transcript + " ";
                }
            }

            if (segment.trim().length > 0) {
                fullTranscript += segment;
                
                // Propagate updated transcript stream to background service worker
                chrome.runtime.sendMessage({
                    action: "TRANSCRIPT_UPDATE",
                    text: fullTranscript.trim()
                });
            }
        };

        // Continuous Waking Loops
        recognition.onend = () => {
            if (isRecordingActive) {
                console.log("Auto-restarting Web Speech engine in offscreen context...");
                try {
                    recognition.start();
                } catch (e) {
                    console.warn("Failed to restart speech engine inside offscreen session:", e.message);
                }
            }
        };

        recognition.onerror = (e) => {
            console.error("Offscreen SpeechRecognition exception:", e.error);
            if (e.error === "not-allowed") {
                chrome.runtime.sendMessage({
                    action: "TRANSCRIPT_UPDATE",
                    text: "ERROR: Microphone permission was denied by the browser. Please update permissions in extension settings."
                });
            }
        };

        recognition.start();
        console.log("Offscreen continuous recognition loop started.");

    } catch (err) {
        console.error("Offscreen speech initialization failed:", err.message);
        chrome.runtime.sendMessage({
            action: "TRANSCRIPT_UPDATE",
            text: `ERROR: Failed initializing microphone access. (${err.message})`
        });
    }
}

// Commences voice recording automatically on offscreen load
startVoiceCapture();

// Clean up state resources on document tear-down
window.addEventListener("unload", () => {
    isRecordingActive = false;
    if (recognition) {
        recognition.abort();
    }
});
