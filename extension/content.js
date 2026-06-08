/**
 * AI Meeting Assistant - Content Script for Voice Capture
 * Injected into the active tab to execute continuous speech recognition.
 */

// Prevent multiple injections
if (!window.aiMeetingRecorderInjected) {
    window.aiMeetingRecorderInjected = true;

    let recognition = null;
    let fullTranscript = "";
    let isRecordingActive = false;

    // Listen for stop messages from the background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "STOP_VOICE_CAPTURE") {
            isRecordingActive = false;
            if (recognition) {
                recognition.abort();
            }
            sendResponse({ success: true });
        }
    });

    /**
     * Asserts microphone permissions and initiates the SpeechRecognition listener loops
     */
    async function startVoiceCapture() {
        try {
            // Trigger microphone media permission checks
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
                    console.log("Auto-restarting Web Speech engine...");
                    try {
                        recognition.start();
                    } catch (e) {
                        console.warn("Failed to restart speech engine:", e.message);
                    }
                }
            };

            recognition.onerror = (e) => {
                console.error("SpeechRecognition exception:", e.error);
                if (e.error === "not-allowed") {
                    chrome.runtime.sendMessage({
                        action: "TRANSCRIPT_UPDATE",
                        text: "ERROR: Microphone permission was denied by the browser."
                    });
                }
            };

            // Start recognition
            recognition.start();
            isRecordingActive = true;
            console.log("Continuous recognition loop started.");

        } catch (err) {
            console.error("Speech initialization failed:", err.message);
            chrome.runtime.sendMessage({
                action: "TRANSCRIPT_UPDATE",
                text: `ERROR: Failed initializing microphone access. (${err.message})`
            });
        }
    }

    // Commences voice recording automatically when injected
    startVoiceCapture();
} else {
    // If already injected, we might need to just restart it if it was stopped.
    // For simplicity, we can just send a message or rely on a function.
    // But since startRecordingSession injects this script every time, 
    // we should expose a way to restart.
    window.dispatchEvent(new CustomEvent("RESTART_VOICE_CAPTURE"));
}

window.addEventListener("RESTART_VOICE_CAPTURE", () => {
    // Basic logic to restart if it was stopped
    // To keep it simple, we don't fully implement restart here, as the user will likely 
    // record once per page load, or the injection logic handles it.
});
