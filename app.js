// ============================================================
// CHURCH VOLUNTEER MANAGER — app.js
// ============================================================
// HOW TO READ THIS FILE:
// Think of it like a recipe. Each section has one job:
//
//   CONFIG  → settings (the one thing you change when going live)
//   STATE   → the app's memory (all data lives here)
//   API     → how we talk to Google Sheets (Day 2 Section 2.3)
//   RENDER  → how we draw the UI from state (Day 2 Section 2.4)
//   ACTIONS → what happens when buttons are clicked (Day 2 Section 2.6)
//   INIT    → startup, wires everything together (Day 2 Section 2.7)
// ============================================================


// ============================================================
// CONFIG
// ============================================================
// This is the ONE value you change when you deploy for real.
// Right now it's empty — we connect it on Day 3.
// Having it at the top means you never have to hunt for it.

const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbwr8BJJb4SZN2QJLTy2Yht18hp4M8sxsGPdJwUFffn3vNEfylxoDspdpaiD6L9n8hA/exec"; // paste your Google Apps Script URL here on Day 3


// These carrier keys map to SMS gateway email domains.
// Must match what's in your Google Apps Script (Code.gs).
const CARRIERS = {
  att:        "AT&T",
  tmobile:    "T-Mobile",
  verizon:    "Verizon",
  sprint:     "Sprint",
  cricket:    "Cricket",
  metropcs:   "Metro PCS",
  boost:      "Boost",
  uscellular: "US Cellular",
  virgin:     "Virgin",
  tracfone: "TracFone",
};

// Maps a mood score number to an emoji for the trend display.
// Score 1 = bad, 2 = neutral, 3 = good.
const MOOD_EMOJI = { 1: "🙁", 2: "🫤", 3: "😄" };

// Maps a mood score to a badge color class in our CSS.
const MOOD_COLOR = { 1: "red", 2: "yellow", 3: "green" };


// ============================================================
// STATE
// ============================================================
// This object is the app's memory.
// It holds ALL the data the app needs to display.
//
// GOLDEN RULE:
//   - RENDER functions READ from state (never write to it)
//   - ACTION functions WRITE to state (then call renderAll)
//   - This means if something looks wrong on screen,
//     you check state first. One place to look. No guessing.

const state = {
  volunteers:  [],     // array of volunteer objects from Google Sheets
  assignments: [],     // array of assignment objects from Google Sheets
  moodLog:     [],     // array of feedback entries from Google Sheets
  alerts:      [],     // array of alert entries from Google Sheets
  loading:     false,  // true while waiting for data from the API
  error:       null,   // holds an error message string, or null if no error
};


// ============================================================
// TAB SWITCHING
// ============================================================
// This is the only function that was in your temporary app.js.
// It moves the "active" class between tab panels and nav buttons.
//
// Called by onclick="switchTab('volunteers', this)" in index.html.
// "this" passes the button element that was clicked.

function switchTab(tabName, btn) {
  // Remove "active" from ALL tab panels
  document.querySelectorAll(".tab")
    .forEach(tab => tab.classList.remove("active"));

  // Remove "active" from ALL nav buttons
  document.querySelectorAll("nav button")
    .forEach(b => b.classList.remove("active"));

  // Add "active" to the correct tab panel
  document.getElementById("tab-" + tabName).classList.add("active");

  // Add "active" to the button that was clicked
  btn.classList.add("active");
}

// Make switchTab available globally so onclick="" in HTML can find it
window.switchTab = switchTab;


// ============================================================
// API LAYER
// ============================================================
// These two functions are the ONLY place in the entire app
// that communicates with Google Sheets.
//
// Why isolate it here?
// If the API URL changes, or the request format changes,
// you fix it in ONE place instead of hunting through the whole file.
// This is called the "single responsibility principle."


/**
 * Sends a GET request to Google Sheets and returns the data.
 *
 * Usage:
 *   const result = await apiFetch("getVolunteers");
 *   console.log(result.volunteers); // array of volunteer objects
 *
 * @param {string} action - tells the backend what data to return
 * @returns {Promise<Object>} - the data from Google Sheets
 */
async function apiFetch(action) {
  // Build the URL with the action as a query parameter
  // e.g. https://script.google.com/...?action=getVolunteers
  const response = await fetch(`${SHEET_API_URL}?action=${action}`);

  // If the server returned an error status (like 404 or 500), throw an error
  if (!response.ok) {
    throw new Error(`API error ${response.status} for action: "${action}"`);
  }

  // .json() converts the raw response text into a JavaScript object
  return response.json();
}


/**
 * Sends a POST request to Google Sheets with data attached.
 *
 * Usage:
 *   await apiPost({ action: "sendOnboarding", name: "Jane", phone: "5551234567" });
 *
 * @param {Object} body - the data to send, must include an "action" property
 * @returns {Promise<Object>} - the response from Google Sheets
 */
async function apiPost(body) {
  const response = await fetch(SHEET_API_URL, {
    method: "POST",

    // JSON.stringify converts a JS object into a text string
    // e.g. { action: "sendOnboarding" } → '{"action":"sendOnboarding"}'
    // The server reads this string and converts it back to an object
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status} for action: "${body.action}"`);
  }

  return response.json();
}


// ============================================================
// UI HELPER FUNCTIONS
// ============================================================
// Small reusable functions used by ALL render functions below.
// Define them first so they're available when render functions call them.


/**
 * Returns an HTML badge span.
 * e.g. _badge("green", "Active") → <span class="badge badge-green">Active</span>
 *
 * The underscore prefix _ is a convention meaning "private helper."
 * It signals to other developers: "this is only used inside this file."
 *
 * @param {string} color - matches a CSS class: green, red, yellow, blue, gray
 * @param {string} text
 * @returns {string} HTML string
 */
function _badge(color, text) {
  return `<span class="badge badge-${color}">${_escape(text)}</span>`;
}


/**
 * Returns a table row that spans all columns with a centered message.
 * Used when a table has no data to show.
 *
 * @param {number} colspan - how many columns the table has
 * @param {string} message - what to display
 * @returns {string} HTML string
 */
function _emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="empty-msg">${message}</td></tr>`;
}


/**
 * Escapes special HTML characters to prevent XSS attacks.
 *
 * WHY THIS MATTERS:
 * If a volunteer's name was <script>alert("hacked")</script>
 * and we put it directly into innerHTML, that script would run.
 * _escape() converts < to &lt; so the browser treats it as text,
 * not as code. ALWAYS escape user data before putting it in innerHTML.
 *
 * @param {*} value - any value (converts to string automatically)
 * @returns {string} safe HTML string
 */
function _escape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/**
 * Shows or hides the loading bar at the top of the page.
 * @param {boolean} visible
 */
function renderLoadingBar(visible) {
  const el = document.getElementById("loadingBar");
  if (el) el.style.display = visible ? "block" : "none";
}


/**
 * Shows a red error banner if message is provided, hides it if null.
 * @param {string|null} message
 */
function renderError(message) {
  const el = document.getElementById("errorMsg");
  if (!el) return;
  el.textContent  = message || "";
  el.style.display = message ? "block" : "none";
}


/**
 * Shows a brief toast notification at the bottom of the screen.
 * Automatically disappears after 3 seconds.
 *
 * @param {string} message
 * @param {"success"|"warn"|"error"} type
 */
function showToast(message, type = "success") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className   = `toast show ${type}`;
  // Remove the "show" class after 3 seconds to fade it out
  setTimeout(() => { el.className = "toast"; }, 3000);
}


// ============================================================
// RENDER FUNCTIONS
// ============================================================
// Each function reads from state and writes HTML to the page.
// RULE: Render functions never change state. They only READ it.


/**
 * Master render function — calls all others.
 * Call this any time state changes and you want the UI to update.
 */
function renderAll() {
  renderError(state.error);
  renderVolunteers();
  renderAssignments();
  renderMoodLog();
  renderMoodTrends();
  renderAlerts();
  syncVolunteerDropdown();
}


/**
 * Renders the volunteers table from state.volunteers.
 *
 * HOW IT WORKS:
 * 1. Find the <tbody> inside #volunteers-table
 * 2. If no volunteers, show a friendly empty message
 * 3. Otherwise, map each volunteer object to an HTML <tr> string
 * 4. Join all the strings together and set as innerHTML
 *
 * .map() transforms every item in an array into something else.
 * Here it turns each volunteer object into an HTML row string.
 * .join("") stitches all those strings into one big string.
 */
function renderVolunteers() {
  const tbody = document.querySelector("#volunteers-table tbody");
  if (!tbody) return; // safety check — exit if element doesn't exist

  // If no volunteers, show the empty state message
  if (!state.volunteers.length) {
    tbody.innerHTML = _emptyRow(6, "👋 No volunteers yet — add one above to get started!");
    return; // stop here, nothing else to do
  }

  // Build one HTML row string per volunteer, then join and insert
  tbody.innerHTML = state.volunteers.map(v => `
    <tr>
      <td>${_escape(v.Name)}</td>
      <td>${_escape(v.Phone)}</td>
      <td>${_escape(v["Ministry Interest"] || "—")}</td>
      <td>${_escape(v.Availability       || "—")}</td>
      <td>${_badge(v.Status === "Active" ? "green" : "gray", v.Status)}</td>
      <td>
        <button class="btn-sm btn-purple"
                onclick="actionSendOnboarding('${v.ID}')">
          📋 Send Survey
        </button>
        <button class="btn-sm btn-blue"
                onclick="actionOpenAssignModal('${v.ID}', '${_escape(v.Name)}')">
          📅 Assign
        </button>
      </td>
    </tr>
  `).join("");
  // .join("") is important — .map() returns an ARRAY of strings.
  // Without .join("") you'd see commas between every row.
}


/**
 * Renders the assignments table from state.assignments.
 * Same pattern as renderVolunteers — find tbody, check empty, map to rows.
 */
function renderAssignments() {
  const tbody = document.querySelector("#assignments-table tbody");
  if (!tbody) return;

  if (!state.assignments.length) {
    tbody.innerHTML = _emptyRow(6, "📅 No assignments yet — assign a volunteer to a service first.");
    return;
  }

  tbody.innerHTML = state.assignments.map(a => `
    <tr>
      <td>${_escape(a.Volunteer)}</td>
      <td>${_escape(a["Service Date"])}</td>
      <td>${_escape(a["Service Time"])}</td>
      <td>${_escape(a.Role)}</td>
      <td>${_badge("blue", a.Status)}</td>
      <td>
        <button class="btn-sm btn-green"
                onclick="actionSendFeedback('${a.ID}')">
          💬 Send Feedback
        </button>
      </td>
    </tr>
  `).join("");
}


/**
 * Renders the feedback log table from state.moodLog.
 * [...state.moodLog].reverse() shows newest entries first.
 * The spread [...] makes a copy so we don't mutate the original array.
 */
function renderMoodLog() {
  const tbody = document.querySelector("#mood-table tbody");
  if (!tbody) return;

  if (!state.moodLog.length) {
    tbody.innerHTML = _emptyRow(4, "💬 No feedback yet — send a post-service survey to get started.");
    return;
  }

  tbody.innerHTML = [...state.moodLog].reverse().map(m => `
    <tr>
      <td>${new Date(m.Timestamp).toLocaleDateString()}</td>
      <td>${_escape(m.Volunteer)}</td>
      <td>${_badge(MOOD_COLOR[m.Score] || "gray", m.Label)}</td>
      <td>${_escape(m.Notes || "—")}</td>
    </tr>
  `).join("");
}


/**
 * Renders the mood trend row per volunteer — last 5 scores as emoji.
 * e.g. "Jane Smith   😄 🫤 😄 😄 😄"
 *
 * .reduce() builds an object grouped by volunteer name.
 * Think of it as a more powerful version of .map() that can
 * transform an array into any shape — here, an object.
 */
function renderMoodTrends() {
  const container = document.getElementById("moodTrends");
  if (!container) return;

  if (!state.moodLog.length) {
    container.innerHTML = `<p class="empty-msg">No feedback data yet.</p>`;
    return;
  }

  // Group scores by volunteer name using reduce
  // Result: { "Jane": [3, 2, 3], "John": [1, 2] }
  const byVolunteer = state.moodLog.reduce((groups, entry) => {
    const name = entry.Volunteer;
    if (!groups[name]) groups[name] = []; // create array if first time seeing this name
    groups[name].push(parseInt(entry.Score));
    return groups;
  }, {}); // {} is the starting value of "groups"

  // Build a trend row for each volunteer
  container.innerHTML = Object.entries(byVolunteer).map(([name, scores]) => {
    const recent = scores.slice(-5); // only show last 5
    const emojis = recent.map(s => MOOD_EMOJI[s] || "?").join(" ");
    return `
      <div class="trend-row">
        <strong>${_escape(name)}</strong>
        <span>${emojis}</span>
      </div>
    `;
  }).join("");
}


/**
 * Renders the alerts table from state.alerts, newest first.
 */
function renderAlerts() {
  const tbody = document.querySelector("#alerts-table tbody");
  if (!tbody) return;

  if (!state.alerts.length) {
    tbody.innerHTML = _emptyRow(5, "✅ No alerts — all volunteers are doing well! 🙌");
    return;
  }

  tbody.innerHTML = [...state.alerts].reverse().map((a, i) => {
    const color      = a["Alert Type"] === "MERCY TEAM" ? "red" : "yellow";

    // Resolved alerts show a green badge, unresolved show a button
    const statusCell = a.Resolved === "Yes"
      ? _badge("green", "Resolved")
      : `<button class="btn-sm btn-green"
                 onclick="actionResolveAlert(${state.alerts.length - 1 - i})">
           Mark Resolved
         </button>`;

    return `
      <tr>
        <td>${new Date(a.Timestamp).toLocaleDateString()}</td>
        <td>${_escape(a.Volunteer)}</td>
        <td>${_badge(color, a["Alert Type"])}</td>
        <td>${_escape(a.Details)}</td>
        <td>${statusCell}</td>
      </tr>
    `;
  }).join("");
}


/**
 * Keeps the volunteer dropdown in the assign modal in sync with state.
 * Called every time renderAll() runs so it always reflects current data.
 */
function syncVolunteerDropdown() {
  const sel = document.getElementById("assignVolSelect");
  if (!sel) return;
  sel.innerHTML = state.volunteers.map(v =>
    `<option value="${v.ID}">${_escape(v.Name)}</option>`
  ).join("");
}


// ============================================================
// ACTION FUNCTIONS
// ============================================================
// These run when the user clicks a button.
// RULE: Action functions are the ONLY place that calls apiPost().
//       After the API call succeeds, they call loadAllData()
//       to refresh state and re-render the UI.


/**
 * Adds a new volunteer and sends them the onboarding survey via SMS.
 * Triggered by clicking the "+ Add & Send Survey" button.
 *
 * Notice the pattern:
 *   1. Read values from the form
 *   2. Validate — stop early if something is missing
 *   3. Call the API inside try/catch
 *   4. On success: clear the form, show a toast, reload data
 *   5. On failure: show an error toast, log to console
 */
async function actionAddVolunteer() {
  // Step 1 — Read form values
  // .trim() removes accidental spaces before/after the text
  const name    = document.getElementById("newVolName").value.trim();
  const phone   = document.getElementById("newVolPhone").value.trim();
  const carrier = document.getElementById("newVolCarrier").value;
  const email   = document.getElementById("newVolEmail").value.trim();

  // Step 2 — Validate
  // If any required field is empty, show a warning and stop
  if (!name || !phone || !carrier) {
    showToast("⚠️ Name, phone, and carrier are required.", "warn");
    return; // "return" exits the function early — nothing below runs
  }

  // Step 3 — Call the API
  try {
    await apiPost({
      action:  "sendOnboarding", // tells Apps Script what to do
      name,                      // shorthand for name: name
      phone,
      carrier,
      email,
    });

    // Step 4 — Success
    showToast(`✅ ${name} added! Onboarding survey sent.`);

    // Clear the form fields so it's ready for the next volunteer
    document.getElementById("newVolName").value  = "";
    document.getElementById("newVolPhone").value = "";
    document.getElementById("newVolEmail").value = "";
    document.getElementById("newVolCarrier").value = "";

    // Wait 1.5 seconds then reload all data so the new row appears
    // Why wait? The Google Sheet needs a moment to save the new row
    setTimeout(loadAllData, 1500);

  } catch (err) {
    // Step 5 — Something went wrong
    showToast("❌ Could not add volunteer. Is the API connected?", "error");
    console.error("actionAddVolunteer failed:", err);
  }
}


/**
 * Sends the onboarding survey to an existing volunteer.
 * Triggered by clicking "📋 Send Survey" in the volunteers table.
 *
 * @param {string} volunteerId - the volunteer's ID from state
 */
async function actionSendOnboarding(volunteerId) {
  // Find the volunteer in state by their ID
  const volunteer = state.volunteers.find(v => v.ID === volunteerId);
  if (!volunteer) return; // safety check

  // Ask for confirmation before sending
  if (!confirm(`Send onboarding survey to ${volunteer.Name}?`)) return;

  try {
    await apiPost({
      action:  "sendOnboarding",
      name:    volunteer.Name,
      phone:   volunteer.Phone,
      carrier: volunteer.Carrier,
    });
    showToast(`✅ Survey sent to ${volunteer.Name}`);

  } catch (err) {
    showToast("❌ Failed to send survey.", "error");
    console.error("actionSendOnboarding failed:", err);
  }
}


/**
 * Opens the assign modal and pre-fills it with the volunteer's info.
 * Triggered by clicking "📅 Assign" in the volunteers table.
 *
 * @param {string} volunteerId
 * @param {string} volunteerName
 */
function actionOpenAssignModal(volunteerId, volunteerName) {
  // Store the volunteer ID in the hidden input inside the modal
  // This is how the modal "remembers" who we're assigning
  document.getElementById("assignVolId").value        = volunteerId;
  document.getElementById("assignVolName").textContent = `Assigning: ${volunteerName}`;

  // Show the modal by setting display to "flex"
  // (CSS has display:none by default, flex centers the box on screen)
  document.getElementById("assignModal").style.display = "flex";
}


/**
 * Closes the assign modal and clears its fields.
 * Triggered by the Cancel button inside the modal.
 */
function closeModal() {
  document.getElementById("assignModal").style.display = "none";

  // Clear fields so old data doesn't show next time the modal opens
  document.getElementById("assignDate").value = "";
  document.getElementById("assignTime").value = "";
  document.getElementById("assignRole").value = "";
}


/**
 * Submits the assignment form — creates the assignment,
 * sends the schedule SMS, and adds a Google Calendar invite.
 * Triggered by clicking "📤 Send Schedule SMS" in the modal.
 */
async function actionSubmitAssignment() {
  // Read values from the modal's form fields
  const volunteerId = document.getElementById("assignVolId").value;
  const date        = document.getElementById("assignDate").value;
  const time        = document.getElementById("assignTime").value;
  const role        = document.getElementById("assignRole").value.trim();

  // Validate — all three fields are required
  if (!date || !time || !role) {
    showToast("⚠️ Date, time, and role are all required.", "warn");
    return;
  }

  try {
    await apiPost({
      action:      "assign",
      volunteerId,
      date,
      time,
      role,
    });

    showToast("✅ Assignment created! Schedule SMS sent.");
    closeModal();
    setTimeout(loadAllData, 1500);

  } catch (err) {
    showToast("❌ Failed to create assignment.", "error");
    console.error("actionSubmitAssignment failed:", err);
  }
}


/**
 * Sends the post-service feedback survey to a volunteer.
 * Triggered by clicking "💬 Send Feedback" in the assignments table.
 *
 * @param {string} assignmentId
 */
async function actionSendFeedback(assignmentId) {
  if (!confirm("Send post-service feedback survey to this volunteer?")) return;

  try {
    await apiPost({ action: "sendFeedback", assignmentId });
    showToast("✅ Feedback survey sent!");
    setTimeout(loadAllData, 1500);

  } catch (err) {
    showToast("❌ Failed to send feedback survey.", "error");
    console.error("actionSendFeedback failed:", err);
  }
}


/**
 * Marks an alert as resolved.
 * Updates state directly (optimistic update) then re-renders.
 *
 * WHY NO API CALL HERE?
 * This is called an "optimistic update" — we update the UI
 * immediately without waiting for the server. It feels instant.
 * A full implementation would also call apiPost to update the sheet.
 * We'll add that on Day 3.
 *
 * @param {number} index - position in state.alerts array
 */
function actionResolveAlert(index) {
  state.alerts[index].Resolved = "Yes"; // update state directly
  renderAlerts();                        // re-render just the alerts table
  showToast("✅ Alert marked as resolved.");
}


// ============================================================
// INIT
// ============================================================
// This runs ONCE when the page finishes loading.
// It is the entry point of the entire application —
// like the front door. Everything starts here.
//
// We use DOMContentLoaded to make sure all the HTML elements
// exist before we try to find them with getElementById.
// If we ran this code before the HTML loaded, getElementById
// would return null and everything would break.

document.addEventListener("DOMContentLoaded", () => {

  // ── BUTTON EVENT LISTENERS ──────────────────────────────
  // We use addEventListener here (not onclick in HTML) because:
  //   - HTML describes STRUCTURE
  //   - JavaScript describes BEHAVIOR
  // Keeping them separate makes both files easier to read.

  // "Add & Send Survey" button on the Volunteers tab
  document.getElementById("addVolunteerBtn")
    ?.addEventListener("click", actionAddVolunteer);
  // The ?. is "optional chaining" — if the element doesn't exist,
  // it quietly does nothing instead of throwing an error.

  // "Send Schedule SMS" button inside the assign modal
  document.getElementById("assignBtn")
    ?.addEventListener("click", actionSubmitAssignment);

  // "Cancel" button inside the assign modal
  document.getElementById("modalCloseBtn")
    ?.addEventListener("click", closeModal);

  // "Refresh" button in the header
  document.getElementById("refreshBtn")
    ?.addEventListener("click", loadAllData);


  // ── EXPOSE FUNCTIONS TO HTML onclick ATTRIBUTES ─────────
  // Some functions are called from onclick="" inside dynamically
  // generated HTML (the table row buttons we build in render functions).
  // Those buttons are created by JavaScript, not written in the HTML file,
  // so they can't use addEventListener — they use onclick="" strings instead.
  // For onclick="" to find a function, it must be on the window object.

  window.switchTab              = switchTab;
  window.closeModal             = closeModal;
  window.actionSendOnboarding   = actionSendOnboarding;
  window.actionOpenAssignModal  = actionOpenAssignModal;
  window.actionSendFeedback     = actionSendFeedback;
  window.actionResolveAlert     = actionResolveAlert;


  // ── LOAD INITIAL DATA ────────────────────────────────────
  // This triggers the full data load when the page opens.
  // It will show the loading bar, fetch all four data sources
  // in parallel, fill state, and call renderAll().
  //
  // Right now SHEET_API_URL is empty so it will show an error —
  // that's expected. We connect it on Day 3.
  // For now, the empty state messages will display correctly.
  loadAllData();

});


/**
 * Loads ALL data from Google Sheets into state at once.
 * Uses Promise.all() to run all four requests IN PARALLEL —
 * meaning they all start at the same time instead of one after another.
 *
 * Sequential (slow):  volunteers → assignments → moodLog → alerts = 4x wait time
 * Parallel (fast):    all four start together, finish together = 1x wait time
 *
 * This is called when the page loads and when Refresh is clicked.
 */
async function loadAllData() {
  // Update state to show we're loading
  state.loading = true;
  state.error   = null;

  // Show the loading bar animation at the top of the page
  renderLoadingBar(true);

  try {
    // Promise.all runs all four fetches at the same time
    // The array destructuring [ v, a, m, al ] unpacks the four results
    const [v, a, m, al] = await Promise.all([
      apiFetch("getVolunteers"),
      apiFetch("getAssignments"),
      apiFetch("getMoodLog"),
      apiFetch("getAlerts"),
    ]);

    // Write the results into state
    // The || [] means "use this data, or an empty array if it's missing"
    state.volunteers  = v.volunteers  || [];
    state.assignments = a.assignments || [];
    state.moodLog     = m.moodLog     || [];
    state.alerts      = al.alerts     || [];

  } catch (err) {
    // Something went wrong — save the error message to state
    // The render functions will display it as a red banner
    state.error = "Could not load data. Check your SHEET_API_URL in app.js.";
    console.error("loadAllData failed:", err);

  } finally {
    // "finally" always runs — even if there was an error above
    // This guarantees the loading bar always gets hidden
    state.loading = false;
    renderLoadingBar(false);

    // Redraw the entire UI with whatever is now in state
    renderAll();
  }
}