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
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");

const entryForm = document.getElementById("entry-form");
const entryDateInput = document.getElementById("entry-date");
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
    subscribeToEntries();
  } else {
    authScreen.hidden = false;
    appScreen.hidden = true;
    if (unsubscribeEntries) unsubscribeEntries();
  }
});

// ---------- Entries: create/update ----------
entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dateStr = entryDateInput.value;
  if (!dateStr) return;

  const calories = Number(caloriesInput.value);
  const protein = Number(proteinInput.value);

  await setDoc(doc(entriesColRef(), dateStr), {
    date: dateStr,
    calories,
    protein,
    updatedAt: serverTimestamp()
  });

  caloriesInput.value = "";
  proteinInput.value = "";
  entryDateInput.value = todayISO();
});

function subscribeToEntries() {
  const q = query(entriesColRef(), orderBy("date", "desc"));
  unsubscribeEntries = onSnapshot(q, (snapshot) => {
    latestEntries = snapshot.docs.map((d) => d.data());
    renderHistory(latestEntries);
  });
}

async function deleteEntry(dateStr) {
  await deleteDoc(doc(entriesColRef(), dateStr));
}

// ---------- Rendering ----------
function renderHistory(entries) {
  historyList.innerHTML = "";
  entryCount.textContent = entries.length ? `${entries.length} day${entries.length === 1 ? "" : "s"}` : "";
  emptyState.hidden = entries.length > 0;

  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "history-row";

    const calMet = goals.calorieGoal != null && entry.calories <= goals.calorieGoal;
    const proMet = goals.proteinGoal != null && entry.protein >= goals.proteinGoal;

    row.innerHTML = `
      <div class="row-date">
        <span class="weekday">${formatWeekday(entry.date)}</span>
        ${formatDateLabel(entry.date)}
      </div>
      <div class="row-stats">
        <div><span class="stat-label">Cal</span>${entry.calories}</div>
        <div><span class="stat-label">Protein</span>${entry.protein}g</div>
      </div>
      <div class="row-indicators">
        ${goals.calorieGoal != null ? `<span class="dot ${calMet ? "met" : "unmet"}" title="Calorie goal ${calMet ? "met" : "not met"}"></span>` : ""}
        ${goals.proteinGoal != null ? `<span class="dot ${proMet ? "met" : "unmet"}" title="Protein goal ${proMet ? "met" : "not met"}"></span>` : ""}
      </div>
      <button class="row-delete" title="Delete entry" aria-label="Delete entry">&times;</button>
    `;

    row.querySelector(".row-delete").addEventListener("click", () => {
      if (confirm(`Delete the entry for ${entry.date}?`)) deleteEntry(entry.date);
    });

    historyList.appendChild(row);
  }
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
