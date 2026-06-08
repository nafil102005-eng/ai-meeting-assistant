/**
 * AI Meeting Assistant - Clerk Auth Helper Module
 * Uses Clerk Frontend CDN SDK (Vanilla JS)
 */

// Clerk publishable key — pk_live_* for production (Vercel)
const CLERK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuYWktbWVldGluZy1hc3Npc3RhbnQtc2V2ZW4udmVyY2VsJA";
// Clerk SDK loaded from jsDelivr CDN — works on all domains including Vercel
const CLERK_SDK_URL = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

// Global auth state configuration
window.authConfig = {
    isInitialized: false,
    user: null,
};

/**
 * Load Clerk JS SDK dynamically from CDN
 */
async function loadClerkSDK() {
    return new Promise((resolve, reject) => {
        if (window.Clerk) {
            resolve(window.Clerk);
            return;
        }

        const script = document.createElement("script");
        script.src = CLERK_SDK_URL;
        script.async = true;
        script.crossOrigin = "anonymous";

        script.onload = () => {
            if (window.Clerk) {
                resolve(window.Clerk);
            } else {
                reject(new Error("Clerk SDK loaded but window.Clerk is undefined."));
            }
        };

        script.onerror = () => {
            reject(new Error("Failed to load Clerk SDK script from CDN."));
        };

        document.head.appendChild(script);
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
