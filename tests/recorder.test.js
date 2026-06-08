import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// -------------------------------------------------------------
// 1. SETUP NODE MOCK BROWSER ENVIRONMENT
// -------------------------------------------------------------
global.window = {};
global.localStorage = {
    store: {},
    getItem(key) {
        return this.store[key] || null;
    },
    setItem(key, value) {
        this.store[key] = String(value);
    },
    removeItem(key) {
        delete this.store[key];
    },
    clear() {
        this.store = {};
    }
};

// Mock SpeechRecognition DUMMY class
class MockSpeechRecognition {
    constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = "";
        this.isStarted = false;
    }
    start() {
        this.isStarted = true;
        if (this.onstart) this.onstart();
    }
    stop() {
        this.isStarted = false;
        if (this.onend) this.onend();
    }
}
global.window.SpeechRecognition = MockSpeechRecognition;

// Read and evaluate recorder.js logic inside Node context
const recorderCode = fs.readFileSync(path.join(rootDir, "js", "recorder.js"), "utf-8");
// Expose Class to global by evaluating it
const evalInContext = new Function(recorderCode);
evalInContext.call(global);

// Retrieve instance from the global evaluation context
const MeetingRecorder = global.window.MeetingRecorder;

// Helper to simulate SpeechRecognition returning results
function triggerSpeechResult(recorder, text, isFinal) {
    const event = {
        resultIndex: 0,
        results: [
            {
                0: { transcript: text },
                isFinal: isFinal
            }
        ]
    };
    recorder.recognition.onresult(event);
}

// -------------------------------------------------------------
// TEST CASE 1: Long Meetings Continuous Aggregation
// -------------------------------------------------------------
test("Recorder Simulation: Long meeting transcript accumulation integrity", () => {
    const recorder = new MeetingRecorder();
    recorder.start("Sprint Planning");

    assert.strictEqual(recorder.isRecording, true);
    assert.strictEqual(recorder.title, "Sprint Planning");

    // Simulate speech chunk 1
    triggerSpeechResult(recorder, "Let's begin the alignment.", true);
    assert.strictEqual(recorder.transcript, "Let's begin the alignment.");

    // Simulate continuous auto-restart end-loop triggers
    recorder.recognition.onend(); // Should restart recognition engine
    assert.strictEqual(recorder.recognition.isStarted, true, "Engine should auto-restart on continuous long meetings.");

    // Simulate speech chunk 2
    triggerSpeechResult(recorder, "Sarah is handling database configuration.", true);
    assert.strictEqual(
        recorder.transcript, 
        "Let's begin the alignment. Sarah is handling database configuration."
    );

    const details = recorder.stop();
    assert.strictEqual(details.transcript, "Let's begin the alignment. Sarah is handling database configuration.");
    assert.strictEqual(recorder.isRecording, false);
});

// -------------------------------------------------------------
// TEST CASE 2: Fast Speech Interim Result Processing
// -------------------------------------------------------------
test("Recorder Simulation: Fast speech interim result handling", () => {
    const recorder = new MeetingRecorder();
    let latestFinal = "";
    let latestInterim = "";

    recorder.onTranscriptUpdate = (finalText, interimText) => {
        latestFinal = finalText;
        latestInterim = interimText;
    };

    recorder.start("Fast Speech Test");

    // Fast speaker typing: interim buffer keeps changing before final locks in
    triggerSpeechResult(recorder, "We need to complete the...", false);
    assert.strictEqual(latestFinal, "");
    assert.strictEqual(latestInterim, "We need to complete the...");

    triggerSpeechResult(recorder, "We need to complete the task by Wednesday", true);
    assert.strictEqual(latestFinal, "We need to complete the task by Wednesday");
    
    recorder.stop();
});

// -------------------------------------------------------------
// TEST CASE 3: Multiple Pauses Mapping
// -------------------------------------------------------------
test("Recorder Simulation: Manage pausing, ignoring, and resuming triggers", () => {
    const recorder = new MeetingRecorder();
    recorder.start("Pause-Resume Flow");

    triggerSpeechResult(recorder, "Statement before pause.", true);
    
    // Pause recording
    recorder.pause();
    assert.strictEqual(recorder.isPaused, true);
    assert.strictEqual(recorder.recognition.isStarted, false);

    // Verify localStorage has isPaused set to true
    const saved = JSON.parse(global.localStorage.getItem(recorder.storageKey));
    assert.strictEqual(saved.isPaused, true);

    // Resume recording
    recorder.resume();
    assert.strictEqual(recorder.isPaused, false);
    assert.strictEqual(recorder.recognition.isStarted, true);

    triggerSpeechResult(recorder, "Statement after resume.", true);
    assert.strictEqual(recorder.transcript, "Statement before pause. Statement after resume.");

    recorder.stop();
});

// -------------------------------------------------------------
// TEST CASE 4: Browser Refresh State Persistence
// -------------------------------------------------------------
test("Recorder Simulation: Verify transcript recovery after browser refresh", () => {
    global.localStorage.clear();
    
    const originalRecorder = new MeetingRecorder();
    originalRecorder.start("Persistence Test");
    triggerSpeechResult(originalRecorder, "Preserve this transcript text.", true);
    
    // Simulating browser crash/refresh: originalRecorder is destroyed
    // Now we instantiate a new recorder (which represents a fresh page load)
    const newRecorder = new MeetingRecorder();
    
    // Load state on startup
    const loaded = newRecorder.loadState();
    
    assert.strictEqual(loaded, true, "State should be loaded from localStorage successfully.");
    assert.strictEqual(newRecorder.title, "Persistence Test");
    assert.strictEqual(newRecorder.isRecording, true);
    assert.strictEqual(newRecorder.transcript, "Preserve this transcript text.");
    
    // Stop and clear
    newRecorder.stop();
    assert.strictEqual(global.localStorage.getItem(newRecorder.storageKey), null, "State should be cleaned after stopping.");
});
