/**
 * AI Meeting Assistant - Web Speech API Recorder Module
 * Handles continuous recording, pause/resume, error recovery, and persistence.
 */

class MeetingRecorder {
    constructor() {
        this.recognition = null;
        this.isRecording = false;
        this.isPaused = false;
        this.title = "";
        this.transcript = ""; // Aggregated final transcript segments
        this.interimTranscript = ""; // Current active speaking buffer
        
        // Hooks for UI callback alerts
        this.onTranscriptUpdate = null; // Callback params: (finalText, interimText)
        this.onStateChange = null;       // Callback params: (stateObject)
        this.onError = null;             // Callback params: (errorMessage)

        this.storageKey = "ai_meeting_assistant_recorder_state";
    }

    /**
     * Checks if SpeechRecognition is supported by the client browser
     */
    isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * Initializes the SpeechRecognition engine instances
     */
    initEngine() {
        if (!this.isSupported()) {
            throw new Error("Web Speech API is not supported in this browser. Please use Chrome.");
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Configure standard engine properties
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";

        // 1. Result Listener: Appends spoken chunks
        this.recognition.onresult = (event) => {
            let interim = "";
            let newFinals = "";

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const resultText = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    newFinals += (newFinals || this.transcript.endsWith(" ") || !this.transcript ? "" : " ") + resultText;
                } else {
                    interim += resultText;
                }
            }

            if (newFinals) {
                this.transcript += newFinals;
                this.saveState();
            }

            this.interimTranscript = interim;

            if (this.onTranscriptUpdate) {
                this.onTranscriptUpdate(this.transcript, this.interimTranscript);
            }
        };

        // 2. Loop Restart Handler: Essential for continuous recording in long meetings
        this.recognition.onend = () => {
            console.log("SpeechRecognition engine onend event fired.");
            // If the user did not explicitly click Stop or Pause, restart the listener loop
            if (this.isRecording && !this.isPaused) {
                console.log("Auto-restarting Web Speech engine for continuous listening...");
                try {
                    this.recognition.start();
                } catch (e) {
                    console.warn("Failed to auto-restart recognition engine:", e);
                }
            }
        };

        // 3. Error Handling
        this.recognition.onerror = (event) => {
            console.error("Speech Recognition engine error:", event.error);
            
            // Ignore benign transient errors like 'no-speech'
            if (event.error === "no-speech") return;

            if (this.onError) {
                this.onError(event.error);
            }
        };
    }

    /**
     * Starts the recording process
     */
    start(meetingTitle = "") {
        if (this.isRecording) return;

        if (!this.recognition) {
            this.initEngine();
        }

        this.title = meetingTitle.trim() || "Untitled Meeting";
        this.transcript = "";
        this.interimTranscript = "";
        this.isRecording = true;
        this.isPaused = false;

        this.saveState();
        this.triggerStateCallback();

        try {
            this.recognition.start();
            console.log("Speech recognition started for meeting:", this.title);
        } catch (e) {
            console.error("Failed to start speech recognition:", e);
            this.isRecording = false;
            this.clearState();
            this.triggerStateCallback();
            throw e;
        }
    }

    /**
     * Pauses the active recording
     */
    pause() {
        if (!this.isRecording || this.isPaused) return;

        this.isPaused = true;
        this.saveState();
        this.triggerStateCallback();

        try {
            // Stop the speech engine from listening
            this.recognition.stop();
            console.log("Speech recognition paused.");
        } catch (e) {
            console.warn("Error pausing speech recognition engine:", e);
        }
    }

    /**
     * Resumes the paused recording
     */
    resume() {
        if (!this.isRecording || !this.isPaused) return;

        this.isPaused = false;
        this.saveState();
        this.triggerStateCallback();

        try {
            this.recognition.start();
            console.log("Speech recognition resumed.");
        } catch (e) {
            console.error("Error resuming speech recognition engine:", e);
            this.isPaused = true;
            this.triggerStateCallback();
            throw e;
        }
    }

    /**
     * Concludes the recording session and clears persistence
     */
    stop() {
        if (!this.isRecording) return { title: this.title, transcript: "" };

        const finalMeetingDetails = {
            title: this.title,
            transcript: this.transcript.trim()
        };

        this.isRecording = false;
        this.isPaused = false;
        
        try {
            this.recognition.stop();
        } catch (e) {
            console.warn("Error stopping engine on finalization:", e);
        }

        this.clearState();
        this.triggerStateCallback();

        console.log("Speech recognition finished. Final transcript length:", finalMeetingDetails.transcript.length);
        return finalMeetingDetails;
    }

    /**
     * Persists current session state to survive browser reloads/refreshes
     */
    saveState() {
        const payload = {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            title: this.title,
            transcript: this.transcript
        };
        localStorage.setItem(this.storageKey, JSON.stringify(payload));
    }

    /**
     * Restores state configurations from localStorage
     */
    loadState() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) return false;

        try {
            const data = JSON.parse(stored);
            this.isRecording = data.isRecording;
            this.isPaused = data.isPaused;
            this.title = data.title;
            this.transcript = data.transcript;

            if (this.isRecording) {
                // If it was recording and reload occurred, reinitialize
                this.initEngine();
                
                // If it wasn't paused, trigger start again automatically
                if (!this.isPaused) {
                    this.recognition.start();
                }
            }

            console.log("Restored recorder state from localStorage. Meeting:", this.title);
            this.triggerStateCallback();
            
            // Push current transcript to listeners
            if (this.onTranscriptUpdate) {
                this.onTranscriptUpdate(this.transcript, "");
            }
            return true;
        } catch (e) {
            console.error("Failed to parse stored recorder state:", e);
            this.clearState();
            return false;
        }
    }

    /**
     * Wipes persisted session state
     */
    clearState() {
        localStorage.removeItem(this.storageKey);
    }

    triggerStateCallback() {
        if (this.onStateChange) {
            this.onStateChange({
                isRecording: this.isRecording,
                isPaused: this.isPaused,
                title: this.title
            });
        }
    }
}

// Export module for window browser contexts
window.MeetingRecorder = MeetingRecorder;
window.meetingRecorderInstance = new MeetingRecorder();
