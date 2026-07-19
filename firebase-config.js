// ---------------------------------------------------------
// Paste your Firebase project's config here.
// Firebase Console -> Project settings -> General -> Your apps -> SDK setup and config
// This is safe to make public — it's not a secret key. Access is controlled
// by the Firestore security rules you'll set up (see README.md).
// ---------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAYmY5p0yUoZvB02FNbJbSzqjiDgPs2jqo",
  authDomain: "food-intake-tracker-a5d8b.firebaseapp.com",
  projectId: "food-intake-tracker-a5d8b",
  storageBucket: "food-intake-tracker-a5d8b.firebasestorage.app",
  messagingSenderId: "129587684126",
  appId: "1:129587684126:web:0d0ad76880fc151c149f0f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
