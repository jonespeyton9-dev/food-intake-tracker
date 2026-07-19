import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- Elements ----------
const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("auth-error");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");

const entryForm = document.getElementById("entry-form");
const entryDateInput = document.getElementById("entry-date");
const sourceInput = document.getElementById("source-input");
const caloriesInput = document.getElementById("calories-input");
const proteinInput = document.getElementById("protein-input");

const historyList = document.getElementById("history-list");
const emptyState = document.getElementById("empty-state");
const entryCount = document.getElementById("entry-count");

const goalsBtn = document.getElementById("goals-btn");
const goalsModal = document.getElementById("goals-modal");
const goalsForm = document.getElementById("goals-form");
const goalsCancelBtn = document.getElementById("goals-cancel-btn");
const calorieGoalInput = document.getElementById("calorie-goal-input");
const proteinGoalInput = document.getElementById("protein-goal-input");

// ---------- State ----------
let currentUser = null;
let unsubscribeEntries = null;
let goals = { calorieGoal: null, proteinGoal: null };
let latestEntries = [];
let expandedDate = null; // the one day currently expanded, or null
let editingItem = null; // { date, id } | null

// ---------- Helpers ----------
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); // local date, not UTC
  return d.toISOString().slice(0, 10);
}

function formatWeekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function generateId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function computeTotals(items) {
  return items.reduce(
    (acc, item) => ({ calories: acc.calories + item.calories, protein: acc.protein + item.protein }),
    { calories: 0, protein: 0 }
  );
}

// Supports entries saved before item-level tracking existed (single calories/protein value, no items array)
function getItemsForEntry(entry) {
  if (Array.isArray(entry.items)) return entry.items;
  if (entry.calories != null || entry.protein != null) {
    return [{ id: "legacy", source: "Logged", calories: entry.calories || 0, protein: entry.protein || 0 }];
  }
  return [];
}

function showError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}

function userDocRef() {
  return doc(db, "users", currentUser.uid);
}

function entriesColRef() {
  return collection(db, "users", currentUser.uid, "entries");
}

function entryDocRef(dateStr) {
  return doc(entriesColRef(), dateStr);
}

// ---------- Auth ----------
entryDateInput.value = todayISO();
entryDateInput.max = todayISO();

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authError.hidden = true;
  signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
    .catch((err) => showError(friendlyAuthError(err)));
});

signupBtn.addEventListener("click", () => {
  authError.hidden = true;
  if (!emailInput.value || !passwordInput.value) {
    showError("Enter an email and password first.");
    return;
  }
  createUserWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value)
    .catch((err) => showError(friendlyAuthError(err)));
});

logoutBtn.addEventListener("click", () => signOut(auth));

function friendlyAuthError(err) {
  const code = err.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Incorrect email or password.";
  }
  if (code.includes("email-already-in-use")) return "That email already has an account — try logging in.";
  if (code.includes("weak-password")) return "Password should be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  return "Something went wrong. Try again.";
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    authScreen.hidden = true;
    appScreen.hidden = false;
    authForm.reset();
    expandedDate = null;
    editingItem = null;
    subscribeToEntries();
    window.scrollTo(0, 0); // land at the top of the app, not wherever the login screen left off
  } else {
    authScreen.hidden = false;
    appScreen.hidden = true;
    if (unsubscribeEntries) unsubscribeEntries();
  }
});

// ---------- Entries: add an item ----------
entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dateStr = entryDateInput.value;
  if (!dateStr) return;

  const newItem = {
    id: generateId(),
    source: sourceInput.value.trim(),
    calories: Number(caloriesInput.value),
    protein: Number(proteinInput.value)
  };

  const existing = latestEntries.find((entry) => entry.date === dateStr);
  const items = [...(existing ? getItemsForEntry(existing) : []), newItem];
  const totals = computeTotals(items);

  await setDoc(entryDocRef(dateStr), {
    date: dateStr,
    items,
    calories: totals.calories,
    protein: totals.protein,
    updatedAt: serverTimestamp()
  });

  sourceInput.value = "";
  caloriesInput.value = "";
  proteinInput.value = "";
  entryDateInput.value = todayISO();
  expandedDate = dateStr; // show the day you just added to
  sourceInput.focus();
});

function subscribeToEntries() {
  const q = query(entriesColRef(), orderBy("date", "desc"));
  unsubscribeEntries = onSnapshot(q, (snapshot) => {
    latestEntries = snapshot.docs.map((d) => d.data());
    renderHistory(latestEntries);
  });
}

async function deleteEntry(dateStr) {
  await deleteDoc(entryDocRef(dateStr));
}

async function saveItems(dateStr, items) {
  if (items.length === 0) {
    await deleteDoc(entryDocRef(dateStr));
    return;
  }
  const totals = computeTotals(items);
  await setDoc(entryDocRef(dateStr), {
    date: dateStr,
    items,
    calories: totals.calories,
    protein: totals.protein,
    updatedAt: serverTimestamp()
  });
}

async function deleteItem(dateStr, itemId) {
  const entry = latestEntries.find((e) => e.date === dateStr);
  if (!entry) return;
  const items = getItemsForEntry(entry).filter((item) => item.id !== itemId);
  await saveItems(dateStr, items);
}

async function editItemSave(dateStr, itemId, updated) {
  const entry = latestEntries.find((e) => e.date === dateStr);
  if (!entry) return;
  const items = getItemsForEntry(entry).map((item) =>
    item.id === itemId ? { ...item, ...updated } : item
  );
  await saveItems(dateStr, items);
  editingItem = null;
}

// ---------- Rendering ----------
function renderHistory(entries) {
  historyList.innerHTML = "";
  entryCount.textContent = entries.length ? `${entries.length} day${entries.length === 1 ? "" : "s"}` : "";
  emptyState.hidden = entries.length > 0;

  for (const entry of entries) {
    historyList.appendChild(buildDayEntry(entry));
  }
}

function buildDayEntry(entry) {
  const wrapper = document.createElement("div");
  wrapper.className = "history-entry";

  const isExpanded = expandedDate === entry.date;

  const row = document.createElement("div");
  row.className = "history-row";

  const calMet = goals.calorieGoal != null && entry.calories >= goals.calorieGoal;
  const proMet = goals.proteinGoal != null && entry.protein >= goals.proteinGoal;

  row.innerHTML = `
    <button class="row-toggle ${isExpanded ? "expanded" : ""}" aria-expanded="${isExpanded}" aria-label="Show items for ${entry.date}">&#9656;</button>
    <div class="row-date">
      <span class="weekday">${formatWeekday(entry.date)}</span>
      ${formatDateLabel(entry.date)}
    </div>
    <div class="row-stats">
      <div><span class="stat-label">Cal</span>${entry.calories}${goals.calorieGoal != null ? `/${goals.calorieGoal}` : ""}</div>
      <div><span class="stat-label">Protein</span>${entry.protein}g${goals.proteinGoal != null ? `/${goals.proteinGoal}g` : ""}</div>
    </div>
    <div class="row-indicators">
      ${goals.calorieGoal != null ? `<span class="dot ${calMet ? "met" : "unmet"}" title="Calorie goal ${calMet ? "met" : "not met"}"></span>` : ""}
      ${goals.proteinGoal != null ? `<span class="dot ${proMet ? "met" : "unmet"}" title="Protein goal ${proMet ? "met" : "not met"}"></span>` : ""}
    </div>
    <button class="row-delete" title="Delete this whole day" aria-label="Delete this whole day">&times;</button>
  `;

  row.querySelector(".row-toggle").addEventListener("click", () => {
    expandedDate = expandedDate === entry.date ? null : entry.date;
    renderHistory(latestEntries);
  });

  row.querySelector(".row-delete").addEventListener("click", () => {
    if (confirm(`Delete all entries for ${entry.date}?`)) deleteEntry(entry.date);
  });

  wrapper.appendChild(row);

  const itemsContainer = document.createElement("div");
  itemsContainer.className = "row-items";
  itemsContainer.hidden = !isExpanded;

  for (const item of getItemsForEntry(entry)) {
    itemsContainer.appendChild(buildItemRow(entry.date, item));
  }

  wrapper.appendChild(itemsContainer);
  return wrapper;
}

function buildItemRow(dateStr, item) {
  const isEditing = editingItem && editingItem.date === dateStr && editingItem.id === item.id;

  if (isEditing) {
    const editRow = document.createElement("div");
    editRow.className = "item-edit-row";
    editRow.innerHTML = `
      <input type="text" class="edit-source" value="${item.source.replace(/"/g, "&quot;")}" required>
      <input type="number" class="edit-calories" min="0" step="1" value="${item.calories}" required>
      <input type="number" class="edit-protein" min="0" step="1" value="${item.protein}" required>
      <div class="item-edit-actions">
        <button class="item-save" type="button">Save</button>
        <button class="item-cancel" type="button">Cancel</button>
      </div>
    `;
    editRow.querySelector(".item-save").addEventListener("click", () => {
      const source = editRow.querySelector(".edit-source").value.trim();
      const calories = Number(editRow.querySelector(".edit-calories").value);
      const protein = Number(editRow.querySelector(".edit-protein").value);
      if (!source) return;
      editItemSave(dateStr, item.id, { source, calories, protein }).then(() => renderHistory(latestEntries));
    });
    editRow.querySelector(".item-cancel").addEventListener("click", () => {
      editingItem = null;
      renderHistory(latestEntries);
    });
    return editRow;
  }

  const itemRow = document.createElement("div");
  itemRow.className = "item-row";
  itemRow.innerHTML = `
    <span class="item-source">${item.source}</span>
    <span class="item-stats">${item.calories} cal &middot; ${item.protein}g protein</span>
    <div class="item-actions">
      <button class="item-edit" type="button">Edit</button>
      <button class="item-delete" type="button">Delete</button>
    </div>
  `;
  itemRow.querySelector(".item-edit").addEventListener("click", () => {
    editingItem = { date: dateStr, id: item.id };
    renderHistory(latestEntries);
  });
  itemRow.querySelector(".item-delete").addEventListener("click", () => {
    if (confirm(`Delete "${item.source}"?`)) deleteItem(dateStr, item.id);
  });
  return itemRow;
}

// ---------- Goals ----------
goalsBtn.addEventListener("click", () => {
  calorieGoalInput.value = goals.calorieGoal ?? "";
  proteinGoalInput.value = goals.proteinGoal ?? "";
  goalsModal.hidden = false;
});

goalsCancelBtn.addEventListener("click", () => (goalsModal.hidden = true));

goalsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    goalsModal.hidden = true;
    return;
  }
  goals = {
    calorieGoal: Number(calorieGoalInput.value),
    proteinGoal: Number(proteinGoalInput.value)
  };
  await setDoc(userDocRef(), goals, { merge: true });
  goalsModal.hidden = true;
});

// Load goals by listening to the user doc, and re-render history whenever they change
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  onSnapshot(userDocRef(), (snap) => {
    const data = snap.data() || {};
    goals = {
      calorieGoal: data.calorieGoal ?? null,
      proteinGoal: data.proteinGoal ?? null
    };
    renderHistory(latestEntries);
  });
});
