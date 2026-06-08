/**
 * AI Meeting Assistant - Clerk Auth Helper Module
 * Uses Clerk Frontend CDN SDK (Vanilla JS)
 */

// Clerk publishable key — pk_live_* for production (Vercel)
const CLERK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuYWktbWVldGluZy1hc3Npc3RhbnQtc2V2ZW4udmVyY2VsJA";
// Clerk v4 CDN: sets window.Clerk automatically on load (v5 changed this API, v4 matches our usage)
const CLERK_SDK_URL = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@4/dist/clerk.browser.js";

// Global auth state configuration
window.authConfig = {
    isInitialized: false,
    user: null,
};

/**
 * Load Clerk JS SDK dynamically from CDN
 */
/**
 * Return window.Clerk — the SDK is pre-loaded via the HTML <script> tag
 * before this file runs (because auth.js has defer and Clerk script does not).
 */
async function loadClerkSDK() {
    if (window.Clerk) {
        return window.Clerk;
    }
    // Safety: wait up to 3s for Clerk to be available (handles slow CDN)
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = setInterval(() => {
            attempts++;
            if (window.Clerk) {
                clearInterval(check);
                resolve(window.Clerk);
            } else if (attempts > 30) { // 30 * 100ms = 3s timeout
                clearInterval(check);
                reject(new Error("Clerk SDK failed to load from CDN after 3 seconds. Check your internet connection."));
            }
        }, 100);
    });
}

/**
 * Initialize Clerk JS and apply UI route guards
 */
async function initAuth() {
    try {
        console.log("Initializing Clerk SDK...");
        const Clerk = await loadClerkSDK();
        
        await Clerk.load({
            publishableKey: CLERK_PUBLISHABLE_KEY
        });

        window.authConfig.isInitialized = true;
        window.authConfig.user = Clerk.user;

        console.log("Clerk SDK initialized successfully. User status:", Clerk.user ? "Signed-In" : "Signed-Out");

        // Handle page-specific mounts and guards
        handleRouteGuards();
        handleComponentMounts();

    } catch (error) {
        console.error("Clerk Auth initialization error:", error);
        // Show fallback UI for network/load failures
        const loadingScreen = document.getElementById("loading-overlay");
        if (loadingScreen) {
            loadingScreen.innerHTML = `<div class="error-msg">Auth Service Offline. Check your connection.</div>`;
        }
    }
}

/**
 * Enforces route protections based on session state
 */
function handleRouteGuards() {
    const path = window.location.pathname;
    const isDashboard = path.includes("dashboard.html");
    const isLogin = path.includes("index.html") || path === "/" || path === "";
    const isRegister = path.includes("register.html");

    const signedIn = !!window.Clerk.user;

    if (isDashboard && !signedIn) {
        console.log("Unauthorized access to dashboard. Redirecting to Login...");
        window.location.href = "index.html";
    } else if ((isLogin || isRegister) && signedIn) {
        console.log("Session active. Redirecting to Dashboard...");
        window.location.href = "dashboard.html";
    }

    // Hide loader overlay if present
    const loader = document.getElementById("loading-overlay");
    if (loader) {
        loader.classList.add("hidden");
    }
}

/**
 * Mounts Clerk pre-built components into corresponding elements
 */
function handleComponentMounts() {
    const Clerk = window.Clerk;
    if (!Clerk) return;

    // 1. Mount Sign In container on index.html
    const signInContainer = document.getElementById("signin-container");
    if (signInContainer && !Clerk.user) {
        Clerk.mountSignIn(signInContainer, {
            afterSignInUrl: "dashboard.html",
            signUpUrl: "register.html",
        });
    }

    // 2. Mount Sign Up container on register.html
    const signUpContainer = document.getElementById("signup-container");
    if (signUpContainer && !Clerk.user) {
        Clerk.mountSignUp(signUpContainer, {
            afterSignUpUrl: "dashboard.html",
            signInUrl: "index.html",
        });
    }

    // 3. Mount User Button Profile on dashboard.html
    const userButtonContainer = document.getElementById("user-profile-btn");
    if (userButtonContainer && Clerk.user) {
        Clerk.mountUserButton(userButtonContainer, {
            afterSignOutUrl: "index.html"
        });
    }
}

/**
 * Helper to fetch a fresh JWT Clerk Token for securing API requests
 */
async function getAuthHeaders() {
    if (!window.Clerk || !window.Clerk.session) {
        return {};
    }
    try {
        const token = await window.Clerk.session.getToken();
        return {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };
    } catch (e) {
        console.error("Failed to retrieve Clerk session token:", e);
        return {};
    }
}

/**
 * Log out handler
 */
async function performSignOut() {
    if (window.Clerk) {
        await window.Clerk.signOut();
        window.location.href = "index.html";
    }
}

// Start initialization automatically when page DOM is ready
document.addEventListener("DOMContentLoaded", initAuth);

// Export to global scope
window.getAuthHeaders = getAuthHeaders;
window.performSignOut = performSignOut;
