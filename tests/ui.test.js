import test from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

/**
 * Helper to check file existence
 */
function fileExists(filePath) {
    try {
        fs.accessSync(filePath);
        return true;
    } catch {
        return false;
    }
}

// -------------------------------------------------------------
// TEST CASE 1: Broken Navigation Link Checker
// -------------------------------------------------------------
test("UI Verification: Scan all HTML files for broken internal links", () => {
    const htmlFiles = ["index.html", "register.html", "dashboard.html", "history.html", "details.html", "settings.html"];
    
    htmlFiles.forEach(file => {
        const filePath = path.join(rootDir, file);
        assert.ok(fileExists(filePath), `Target page file ${file} should exist.`);

        const content = fs.readFileSync(filePath, "utf-8");
        // Regex to extract all href targets
        const hrefRegex = /href=["']([^"']+)["']/g;
        let match;

        while ((match = hrefRegex.exec(content)) !== null) {
            const href = match[1];
            
            // Ignore external CDN links, bookmarks, and parameters
            if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto")) {
                continue;
            }

            // Clean query parameters from link for comparison
            const cleanedHref = href.split("?")[0];
            const targetPath = path.join(rootDir, cleanedHref);
            
            assert.ok(
                fileExists(targetPath), 
                `Broken link detected in ${file}: target "${href}" does not exist on disk.`
            );
        }
    });
});

// -------------------------------------------------------------
// TEST CASE 2: Layout Consistency Checks
// -------------------------------------------------------------
test("UI Verification: Assert that pages link to the global styles and shared navigation scripts", () => {
    const pagesRequiringStyles = ["index.html", "register.html", "dashboard.html", "history.html", "details.html", "settings.html"];
    const pagesRequiringNav = ["dashboard.html", "history.html", "details.html", "settings.html"];

    pagesRequiringStyles.forEach(page => {
        const content = fs.readFileSync(path.join(rootDir, page), "utf-8");
        assert.ok(
            content.includes('href="css/styles.css"'), 
            `Page ${page} is missing references to the global style sheets css/styles.css`
        );
    });

    pagesRequiringNav.forEach(page => {
        const content = fs.readFileSync(path.join(rootDir, page), "utf-8");
        assert.ok(
            content.includes('src="js/navigation.js"'), 
            `Page ${page} is missing reference to the shared navigation generator js/navigation.js`
        );
    });
});

// -------------------------------------------------------------
// TEST CASE 3: CSS Responsiveness Assertions
// -------------------------------------------------------------
test("UI Verification: Verify responsiveness tokens and media queries inside stylesheet", () => {
    const stylePath = path.join(rootDir, "css", "styles.css");
    assert.ok(fileExists(stylePath), "Stylesheet css/styles.css should exist.");

    const styleContent = fs.readFileSync(stylePath, "utf-8");

    // Assert media query definitions
    assert.ok(
        styleContent.includes("@media (max-width: 1024px)") || styleContent.includes("@media(max-width:1024px)"),
        "css/styles.css should define media queries for tablet scaling (max-width: 1024px)."
    );
    assert.ok(
        styleContent.includes("@media (max-width: 768px)") || styleContent.includes("@media(max-width:768px)"),
        "css/styles.css should define media queries for mobile responsiveness (max-width: 768px)."
    );

    // Verify grid collapse properties
    assert.ok(
        styleContent.includes("grid-template-columns: 1fr") || styleContent.includes("grid-template-columns:1fr"),
        "css/styles.css should define grid layout collapse columns for mobile responsive viewports."
    );
});

// -------------------------------------------------------------
// TEST CASE 4: Accessibility and Semantic HTML Standards
// -------------------------------------------------------------
test("UI Verification: Verify semantic HTML outline tags and unique identifiers", () => {
    const pages = ["dashboard.html", "history.html", "details.html", "settings.html"];

    pages.forEach(page => {
        const content = fs.readFileSync(path.join(rootDir, page), "utf-8");
        
        // Assert that appropriate structural tags are used
        assert.ok(content.includes("<main"), `Page ${page} should contain a semantic <main> tag.`);
        assert.ok(content.includes("<body"), `Page ${page} should contain a semantic <body> tag.`);
        
        // Assert that interactive containers have specific structural IDs
        assert.ok(
            content.includes('id="loading-overlay"'), 
            `Page ${page} is missing mandatory screen loader overlay #loading-overlay`
        );
    });
});
