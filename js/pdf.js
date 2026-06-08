/**
 * AI Meeting Assistant - PDF Export Utility Module
 * Works seamlessly in both browser (window/global context) and Node.js testing environments.
 */

const isNode = typeof process !== 'undefined' && process.release && process.release.name === 'node';

/**
 * Dynamically resolves the jsPDF constructor from global namespace or Node import.
 */
async function getJsPDF() {
    if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) {
        return window.jspdf.jsPDF;
    }
    if (isNode) {
        const { jsPDF } = await import('jspdf');
        return jsPDF;
    }
    throw new Error('jsPDF library could not be located in global scope or node modules.');
}

/**
 * Normalizes Unicode characters and strips unsupported non-ASCII glyphs
 * to prevent jsPDF WinAnsiEncoding rendering exceptions.
 * @param {string} text - Raw input string
 * @returns {string} Sanitized ASCII-friendly string
 */
export function sanitizeUnicode(text) {
    if (typeof text !== "string") return "";
    return text
        .normalize("NFD") // Decompose accents (e.g. é -> e + accent mark)
        .replace(/[\u0300-\u036f]/g, "") // Strip accent marks
        .replace(/[\u2018\u2019\u201B\u2717]/g, "'") // Map curly quotes and tick symbols
        .replace(/[\u201C\u201D\u201F\u2033]/g, '"') // Map smart double quotes
        .replace(/[\u2013\u2014\u2212]/g, "-") // Map en/em dashes and minus signs
        .replace(/[\u2026]/g, "...") // Map ellipses
        .replace(/[^\x20-\x7E\n\r\t]/g, "?"); // Replace other non-printable/Unicode characters with fallback '?'
}

/**
 * Formats duration from seconds to a clean readable string (e.g. "45 min" or "1 hr 15 min")
 * @param {number} seconds - Meeting duration
 * @returns {string} Readable duration
 */
function formatDuration(seconds) {
    if (!seconds) return "0 min";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

/**
 * Generates a styled, paginated PDF report of the meeting.
 * @param {object} meeting - The complete meeting data package
 * @param {object} options - Custom generation settings (download, filename, etc.)
 * @returns {Promise<any>} The generated jsPDF instance
 */
export async function generatePdf(meeting, options = {}) {
    if (!meeting) {
        throw new Error("Invalid Parameter: Meeting data package is required.");
    }

    const jsPDF = await getJsPDF();
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    let pageCount = 1;

    // Helper to draw premium page background, borders, and footer headers
    const initPageStyle = (pdfDoc) => {
        // Dark theme background fill matching dashboard aesthetics
        pdfDoc.setFillColor(7, 8, 13); // HSL: #07080d
        pdfDoc.rect(0, 0, 210, 297, "F");

        // Subtle geometric frame border
        pdfDoc.setDrawColor(255, 255, 255, 10); // Alpha-like representation (RGB white, low opacity logic)
        pdfDoc.setLineWidth(0.5);
        pdfDoc.rect(5, 5, 200, 287);

        // Render Page Footer
        pdfDoc.setFontSize(8);
        pdfDoc.setTextColor(100, 110, 130); // Slate / muted color
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.text(`Page ${pageCount}`, 190, 290);
        pdfDoc.text(`AI Meeting Assistant Report - Confidential`, 14, 290);
    };

    // Draw style wrapper on initial page
    initPageStyle(doc);

    let currentY = 25;

    // Standard pagination threshold logic
    const checkPageOverflow = (lineHeight) => {
        if (currentY + lineHeight > 275) {
            doc.addPage();
            pageCount++;
            initPageStyle(doc);
            currentY = 20; // reset layout cursor to top margin of new page
        }
    };

    // 1. Report Title Header
    doc.setTextColor(99, 102, 241); // Indigo color code #6366f1
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    const sanitizedTitle = sanitizeUnicode(meeting.title || "Untitled Sync Session").toUpperCase();
    doc.text(sanitizedTitle, 14, currentY);
    currentY += 8;

    // 2. Metadata details
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.setFont("helvetica", "normal");
    const dateStr = meeting.date ? new Date(meeting.date).toLocaleDateString("en-US", {
        year: 'numeric', month: 'long', day: 'numeric'
    }) : "Unknown Date";
    const durationStr = formatDuration(meeting.duration_seconds);
    const metaString = `Platform: ${meeting.platform || "Web Speech"}   |   Date: ${dateStr}   |   Duration: ${durationStr}`;
    doc.text(sanitizeUnicode(metaString), 14, currentY);
    currentY += 6;

    // Divider Line
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.75);
    doc.line(14, currentY, 196, currentY);
    currentY += 12;

    // Generic function to print section titles
    const printSectionTitle = (titleText) => {
        checkPageOverflow(18);
        doc.setFontSize(13);
        doc.setTextColor(249, 250, 251); // White text
        doc.setFont("helvetica", "bold");
        doc.text(titleText, 14, currentY);
        currentY += 4;
        doc.setDrawColor(255, 255, 255, 15);
        doc.line(14, currentY, 196, currentY);
        currentY += 8;
    };

    // 3. Section: Executive Summary
    if (meeting.summary) {
        printSectionTitle("EXECUTIVE SUMMARY");

        doc.setFontSize(9.5);
        doc.setTextColor(180, 185, 195);
        doc.setFont("helvetica", "normal");

        const summaryLines = doc.splitTextToSize(sanitizeUnicode(meeting.summary), 182);
        for (const line of summaryLines) {
            checkPageOverflow(6);
            doc.text(line, 14, currentY);
            currentY += 5.5;
        }
        currentY += 8;
    }

    // 4. Section: Action Items
    const actions = meeting.actionItems || meeting.actions;
    if (actions && actions.length > 0) {
        printSectionTitle("ACTION ITEMS & RESPONSIBILITY");

        doc.setFontSize(9.5);
        doc.setTextColor(180, 185, 195);
        doc.setFont("helvetica", "normal");

        actions.forEach((act, idx) => {
            const statusText = (act.status || "").toLowerCase() === "completed" ? "[DONE]" : "[PENDING]";
            const assigneeText = act.assignee ? ` - Assigned to: ${act.assignee}` : "";
            const rawDesc = act.desc || act.description || "";
            const formattedItem = `${idx + 1}. ${statusText} ${rawDesc}${assigneeText}`;
            
            const actionLines = doc.splitTextToSize(sanitizeUnicode(formattedItem), 182);
            actionLines.forEach(line => {
                checkPageOverflow(6);
                doc.text(line, 14, currentY);
                currentY += 5.5;
            });
        });
        currentY += 8;
    }

    // 5. Section: Decisions Made
    const decisions = meeting.decisions;
    if (decisions && decisions.length > 0) {
        printSectionTitle("KEY DECISIONS MADE");

        doc.setFontSize(9.5);
        doc.setTextColor(180, 185, 195);
        doc.setFont("helvetica", "normal");

        decisions.forEach((dec, idx) => {
            const deciderText = dec.decider ? ` (Decided by: ${dec.decider})` : "";
            const rawDesc = dec.desc || dec.description || "";
            const formattedItem = `${idx + 1}. Decision: ${rawDesc}${deciderText}`;

            const decisionLines = doc.splitTextToSize(sanitizeUnicode(formattedItem), 182);
            decisionLines.forEach(line => {
                checkPageOverflow(6);
                doc.text(line, 14, currentY);
                currentY += 5.5;
            });
        });
        currentY += 8;
    }

    // 6. Section: Full Meeting Transcript
    if (meeting.transcript) {
        printSectionTitle("FULL MEETING TRANSCRIPT");

        doc.setFontSize(8.5);
        doc.setTextColor(156, 163, 175); // Slightly smaller and more muted
        doc.setFont("helvetica", "normal");

        const paragraphs = meeting.transcript.split("\n");
        for (const paragraph of paragraphs) {
            if (!paragraph.trim()) {
                currentY += 3; // small whitespace between paragraphs
                continue;
            }
            
            const transcriptLines = doc.splitTextToSize(sanitizeUnicode(paragraph), 182);
            for (const line of transcriptLines) {
                checkPageOverflow(5.5);
                doc.text(line, 14, currentY);
                currentY += 5;
            }
            currentY += 1.5; // post-paragraph buffer
        }
    }

    // Trigger local client file download if enabled
    if (options.download !== false && typeof window !== "undefined") {
        const fileTitle = (meeting.title || "Meeting-Report").trim().replace(/\s+/g, "-");
        doc.save(`Meeting-Report-${fileTitle}.pdf`);
    }

    return doc;
}

// Bind to window object if running inside browser scope
if (typeof window !== "undefined") {
    window.pdfExporter = {
        generatePdf,
        sanitizeUnicode
    };
}
