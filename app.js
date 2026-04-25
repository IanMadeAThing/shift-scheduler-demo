/**
 * ============================================================
 * CHURCH VOLUNTEER MANAGER — Frontend (app.js)
 * ============================================================
 * HOW THIS FILE IS ORGANISED:
 *   1. CONFIG          — the one value you need to change
 *   2. STATE           — all app data lives here, nowhere else
 *   3. API             — all communication with Google Sheets
 *   4. RENDER          — functions that draw the UI from state
 *   5. ACTIONS         — functions triggered by user clicks
 *   6. UI HELPERS      — toast, modal, loading bar
 *   7. INIT            — startup, event binding, tab switching
 *
 * RULE: State only changes inside ACTION functions.
 *       RENDER functions only read state — they never change it.
 *       This makes bugs much easier to find.
 * ============================================================
 */


// ============================================================ 
// 1. CONFIG
// ============================================================

/**
 * Paste your Google Apps Script Web App URL here.
 * Deploy → New Deployment → Web App → copy the URL.
 * @type {string}
 */
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycby3EdN77wsQUw2MO2MZ2vRooojlFKBhwUmvU0cs2naYQ1ts34jaHfysAHO_lCxgE5rV/exec";

/**
 * Maps carrier keys to human-readable names for the dropdown.
 * Must match the keys in CARRIER_GATEWAYS in Code.gs.
 * @type {Object.<string, string>}
 */
const CARRIERS = {
  att:        "AT&T",
  mint:       "Mint Mobile",
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

/**
 * Maps mood scores to emoji for the trend display.
 * @type {Object.<number, string>}
 */
const MOOD_EMOJI = { 1: "🙁", 2: "🫤", 3: "😄" };

/**
 * Maps mood scores to badge colour classes.
 * @type {Object.<number, string>}
 */
const MOOD_COLOR = { 1: "red", 2: "yellow", 3: "green" };


// ============================================================
// 2. STATE
// ============================================================

/**
 * The single source of truth for all app data.
 * Every render function reads from here.
 * Every action function writes to here, then calls renderAll().
 */
const state = {
  volunteers:  [],
  assignments: [],
  moodLog:     [],
  alerts:      [],
  loading:     false,
  error:       null,
};


// ============================================================
// 3. API — communication with Google Sheets
// ============================================================

/**
 * Sends a GET request to the Apps Script Web App.
 * @param {string} action - e.g. "getVolunteers"
 * @returns {Promise<Object>}
 */
async function apiFetch(action) {
  const res = await fetch(`${SHEET_API_URL}?action=${action}`);
  if (!res.ok) throw new Error(`API error ${res.status} for action "${action}"`);
  return res.json();
}

/**
 * Sends a POST request to the Apps Script Web App.
 * @param {Object} body - Must include an "action" property
 * @returns {Promise<Object>}
 */
async function apiPost(body) {
  const res = await fetch(SHEET_API_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status} for action "${body.action}"`);
  return res.json();
}

/**
 * Loads all data from Google Sheets into state, then re-renders.
 * Uses Promise.all so all four requests run in parallel — faster
 * than running them one at a time.
 */
async function loadAllData() {
  state.loading = true;
  state.error   = null;
  renderLoadingBar(true);

  try {
    const [v, a, m, al] = await Promise.all([
      apiFetch("getVolunteers"),
      apiFetch("getAssignments"),
      apiFetch("getMoodLog"),
      apiFetch("getAlerts"),
    ]);
    state.volunteers  = v.volunteers  || [];
    state.assignments = a.assignments || [];
    state.moodLog     = m.moodLog     || [];
    state.alerts      = al.alerts     || [];
  } catch (err) {
    state.error = "Could not load data from Google Sheets. Check your SHEET_API_URL.";
    console.error("loadAllData failed:", err);
  } finally {
    // Always runs — even if there was an error
    state.loading = false;
    renderLoadingBar(false);
    renderAll();
  }
}


// ============================================================
// 4. RENDER — draw the UI from state
// ============================================================

/** Calls all render functions. Use this after any state change. */
function renderAll() {
  renderError(state.error);
  renderVolunteers();
  renderAssignments();
  renderMoodLog();
  renderMoodTrends();
  renderAlerts();
  syncVolunteerDropdowns();
}

/**
 * Renders the volunteers table.
 * Each row has buttons to send the onboarding survey or open the assign modal.
 */
function renderVolunteers() {
  const listContainer = document.querySelector("#volunteers-list"); 
  if (!listContainer) return;

  if (!state.volunteers.length) {
    listContainer.innerHTML = `<p class="empty-msg">No volunteers yet. Add one above.</p>`;
    return;
  }

  // If you want to keep the "Card" style from your HTML, use this:
  listContainer.innerHTML = state.volunteers.map(v => `
    <div class="volunteer-card">
      <div class="vol-info">
        <strong>${_escape(v.Name)}</strong>
        <span>${_escape(v.Phone)}</span>
      </div>
      <div class="vol-actions">
        <button class="btn-sm btn-purple" onclick="actionSendOnboarding('${v.ID}')">📋 Survey</button>
        <button class="btn-sm btn-blue" onclick="actionOpenAssignModal('${v.ID}', '${_escape(v.Name)}')">📅 Assign</button>
      </div>
    </div>
  `).join("");
}

/**
 * Renders the assignments table.
 * Each row has a button to send the post-service feedback survey.
 */
function renderAssignments() {
  const tbody = document.querySelector("#assignments-table tbody");
  if (!tbody) return;

  if (!state.assignments.length) {
    tbody.innerHTML = _emptyRow(6, "No assignments yet.");
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
        <button class="btn-sm btn-green" onclick="actionSendFeedback('${a.ID}')">💬 Send Feedback</button>
      </td>
    </tr>
  `).join("");
}

/**
 * Renders the mood log table, newest entries first.
 */
function renderMoodLog() {
  const tbody = document.querySelector("#mood-table tbody");
  if (!tbody) return;

  if (!state.moodLog.length) {
    tbody.innerHTML = _emptyRow(4, "No feedback submitted yet.");
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
 * Renders the last 5 mood scores per volunteer as emoji.
 * e.g. "Jane Smith  😄 🫤 😄 😄 😄"
 */
function renderMoodTrends() {
  const container = document.getElementById("moodTrends");
  if (!container) return;

  // Group mood entries by volunteer name
  const byVolunteer = state.moodLog.reduce((acc, m) => {
    if (!acc[m.Volunteer]) acc[m.Volunteer] = [];
    acc[m.Volunteer].push(parseInt(m.Score));
    return acc;
  }, {});

  if (!Object.keys(byVolunteer).length) {
    container.innerHTML = `<p class="empty-msg">No feedback data yet.</p>`;
    return;
  }

  container.innerHTML = Object.entries(byVolunteer).map(([name, scores]) => {
    const recent = scores.slice(-5).map(s => MOOD_EMOJI[s] || "?").join(" ");
    return `<div class="trend-row"><strong>${_escape(name)}</strong><span>${recent}</span></div>`;
  }).join("");
}

/**
 * Renders the alerts table, newest first.
 */
function renderAlerts() {
  const tbody = document.querySelector("#alerts-table tbody");
  if (!tbody) return;

  if (!state.alerts.length) {
    tbody.innerHTML = _emptyRow(5, "No alerts. All volunteers are doing well! 🙌");
    return;
  }

  tbody.innerHTML = [...state.alerts].reverse().map((a, i) => {
    const color      = a["Alert Type"] === "MERCY TEAM" ? "red" : "yellow";
    const statusCell = a.Resolved === "Yes"
      ? _badge("green", "Resolved")
      : `<button class="btn-sm btn-green" onclick="actionResolveAlert(${state.alerts.length - 1 - i})">Mark Resolved</button>`;
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
 */
function syncVolunteerDropdowns() {
  const sel = document.getElementById("assignVolSelect");
  if (!sel) return;
  sel.innerHTML = state.volunteers.map(v =>
    `<option value="${v.ID}">${_escape(v.Name)}</option>`
  ).join("");
}

/** Shows or hides the loading bar at the top of the page. */
function renderLoadingBar(visible) {
  const el = document.getElementById("loadingBar");
  if (el) el.style.display = visible ? "block" : "none";
}

/** Shows an error message banner, or hides it if error is null. */
function renderError(message) {
  const el = document.getElementById("errorMsg");
  if (!el) return;
  el.textContent  = message || "";
  el.style.display = message ? "block" : "none";
}


// ============================================================
// 5. ACTIONS — triggered by user interactions
// ============================================================

/**
 * Adds a new volunteer and sends them the onboarding survey via SMS.
 * Reads values from the "Add Volunteer" form in the UI.
 */
async function actionAddVolunteer() {
  const name    = document.getElementById("newVolName").value.trim();
  const phone   = document.getElementById("newVolPhone").value.trim();
  const carrier = document.getElementById("newVolCarrier").value;
  const email   = document.getElementById("newVolEmail").value.trim();

  if (!name || !phone || !carrier) {
    showToast("⚠️ Name, phone number, and carrier are all required.", "warn");
    return;
  }

  try {
    await apiPost({ action: "sendOnboarding", name, phone, carrier, email });
    showToast(`✅ ${name} added and onboarding survey sent!`);
    // Clear the form
    ["newVolName", "newVolPhone", "newVolEmail"].forEach(id => {
      document.getElementById(id).value = "";
    });
    // Wait a moment then reload so the new row appears
    setTimeout(loadAllData, 1500);
  } catch (err) {
    showToast("❌ Failed to add volunteer. Check the console.", "error");
    console.error("actionAddVolunteer:", err);
  }
}

/**
 * Sends the onboarding survey to an existing volunteer.
 * @param {string} volunteerId
 */
async function actionSendOnboarding(volunteerId) {
  const volunteer = state.volunteers.find(v => v.ID === volunteerId);
  if (!volunteer) return;
  if (!confirm(`Send onboarding survey to ${volunteer.Name}?`)) return;

  try {
    await apiPost({ action: "sendOnboarding", name: volunteer.Name, phone: volunteer.Phone, carrier: volunteer.Carrier });
    showToast(`✅ Survey sent to ${volunteer.Name}`);
  } catch (err) {
    showToast("❌ Failed to send survey.", "error");
    console.error("actionSendOnboarding:", err);
  }
}

/**
 * Opens the assignment modal pre-filled with the volunteer's ID and name.
 * @param {string} volunteerId
 * @param {string} volunteerName
 */
function actionOpenAssignModal(volunteerId, volunteerName) {
  document.getElementById("assignVolId").value   = volunteerId;
  document.getElementById("assignVolName").textContent = `Assigning: ${volunteerName}`;
  document.getElementById("assignModal").style.display = "flex";
}

/**
 * Submits the assignment form — creates the assignment, sends the
 * schedule SMS, and adds a Google Calendar invite.
 */
async function actionSubmitAssignment() {
  const volunteerId = document.getElementById("assignVolId").value;
  const date        = document.getElementById("assignDate").value;
  const time        = document.getElementById("assignTime").value;
  const role        = document.getElementById("assignRole").value.trim();

  if (!date || !time || !role) {
    showToast("⚠️ Date, time, and role are all required.", "warn");
    return;
  }

  try {
    await apiPost({ action: "assign", volunteerId, date, time, role });
    showToast("✅ Assignment created and schedule SMS sent!");
    closeModal();
    setTimeout(loadAllData, 1500);
  } catch (err) {
    showToast("❌ Failed to create assignment.", "error");
    console.error("actionSubmitAssignment:", err);
  }
}

/**
 * Sends the post-service feedback survey to a volunteer.
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
    console.error("actionSendFeedback:", err);
  }
}

/**
 * Marks an alert as resolved in the local state and re-renders.
 * (A full implementation would also update the sheet via apiPost.)
 * @param {number} index - Index in state.alerts array
 */
function actionResolveAlert(index) {
  state.alerts[index].Resolved = "Yes";
  renderAlerts();
  showToast("✅ Alert marked as resolved.");
}


// ============================================================
// 6. UI HELPERS
// ============================================================

/**
 * Shows a brief toast notification at the bottom of the screen.
 * Automatically disappears after 3 seconds.
 * @param {string} message
 * @param {"success"|"warn"|"error"} type
 */
function showToast(message, type = "success") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.className   = `toast show ${type}`;
  setTimeout(() => { el.className = "toast"; }, 3000);
}

/** Closes the assignment modal and clears its fields. */
function closeModal() {
  document.getElementById("assignModal").style.display = "none";
  document.getElementById("assignDate").value = "";
  document.getElementById("assignTime").value = "";
  document.getElementById("assignRole").value = "";
}

/**
 * Switches the visible tab panel and highlights the active nav button.
 * Called by onclick on each nav button.
 * @param {string} tabName - Matches the id "tab-{tabName}"
 * @param {HTMLElement} btn - The clicked nav button
 */
function switchTab(tabName, btn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
  btn.classList.add("active");
}

/**
 * Returns an HTML badge span with colour and label.
 * @param {string} color - "green", "red", "yellow", "blue", "gray"
 * @param {string} text
 * @returns {string} HTML string
 */
function _badge(color, text) {
  return `<span class="badge badge-${color}">${_escape(text)}</span>`;
}

/**
 * Returns a table row that spans all columns with a centered message.
 * Used when a table has no data to display.
 * @param {number} colspan
 * @param {string} message
 * @returns {string} HTML string
 */
function _emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="empty-msg">${message}</td></tr>`;
}

/**
 * Escapes HTML special characters to prevent XSS.
 * Always use this when inserting user-provided data into innerHTML.
 * @param {*} value
 * @returns {string}
 */
function _escape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// ============================================================
// 7. INIT — runs once when the page loads
// ============================================================

/**
 * Wires up all event listeners and loads initial data.
 * Using addEventListener here (not onclick in HTML) keeps
 * JavaScript out of the HTML for static elements.
 */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addVolunteerBtn")?.addEventListener("click", actionAddVolunteer);
  document.getElementById("assignBtn")?.addEventListener("click", actionSubmitAssignment);
  document.getElementById("refreshBtn")?.addEventListener("click", loadAllData);
  document.getElementById("modalCloseBtn")?.addEventListener("click", closeModal);

  // Expose functions that are called from dynamic HTML (table row buttons)
  // These need to be on window because they're in onclick="" attributes
  window.actionSendOnboarding    = actionSendOnboarding;
  window.actionOpenAssignModal   = actionOpenAssignModal;
  window.actionSendFeedback      = actionSendFeedback;
  window.actionResolveAlert      = actionResolveAlert;
  window.switchTab               = switchTab;
  window.closeModal              = closeModal;

  // Load all data on startup
  loadAllData();
});