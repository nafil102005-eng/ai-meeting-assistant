/**
 * AI Meeting Assistant - Shared Navigation Render Script
 * Dynamically injects a responsive, accessible header into all logged-in views.
 */

document.addEventListener("DOMContentLoaded", () => {
    // Determine the current page name to mark the active navigation tab
    const currentPath = window.location.pathname;
    const pageName = currentPath.substring(currentPath.lastIndexOf("/") + 1) || "dashboard.html";

    // 1. Build and inject SVG Linear Gradients used for premium coloring
    injectSvgGradients();

    // 2. Locate or create the header container
    let headerEl = document.querySelector("header");
    if (!headerEl) {
        headerEl = document.createElement("header");
        document.body.insertBefore(headerEl, document.body.firstChild);
    }

    // 3. Assemble and inject the header HTML content
    headerEl.innerHTML = `
        <div class="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
            <a href="dashboard.html" style="background: linear-gradient(135deg, var(--primary-color), var(--accent-color)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">AI Meeting Assistant</a>
        </div>
        
        <nav class="nav-links">
            <a href="dashboard.html" class="nav-item ${pageName.includes("dashboard.html") ? "active" : ""}">Dashboard</a>
            <a href="history.html" class="nav-item ${pageName.includes("history.html") || pageName.includes("details.html") ? "active" : ""}">Meeting History</a>
            <a href="settings.html" class="nav-item ${pageName.includes("settings.html") ? "active" : ""}">Settings</a>
        </nav>
        
        <div class="nav-right">
            <span id="user-display-email" style="font-size: 0.9rem; color: var(--text-muted); font-weight: 500;"></span>
            <!-- Target Mount Container for Clerk Profile Avatar -->
            <div id="user-profile-btn" style="min-width: 28px; min-height: 28px;"></div>
        </div>
    `;

    console.log("Navigation header dynamically generated.");
});

/**
 * Injects SVG linear gradient definitions to allow styled color strokes on logo SVG
 */
function injectSvgGradients() {
    if (document.getElementById("svg-global-defs")) return;

    const svgDefs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgDefs.id = "svg-global-defs";
    svgDefs.style.position = "absolute";
    svgDefs.style.width = "0";
    svgDefs.style.height = "0";
    svgDefs.style.overflow = "hidden";
    
    svgDefs.innerHTML = `
        <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#6366f1" />
                <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
        </defs>
    `;
    document.body.appendChild(svgDefs);
}
