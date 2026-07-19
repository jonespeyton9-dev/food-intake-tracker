# Daily Log

A tiny, single-page app for tracking daily calories and protein against goals.
No frameworks, no build step — just `index.html`, `styles.css`, `app.js`, and `firebase-config.js`.

---

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Name it whatever you like (e.g. `daily-log`). You can skip Google Analytics.
3. Once created, click the **`</>`** (web) icon on the project overview page to register a web app.
   - Nickname doesn't matter. You do **not** need Firebase Hosting here since we're using GitHub Pages.
4. Firebase will show you a `firebaseConfig` object. Copy it — you'll paste it into `firebase-config.js` in step 4.

## 2. Turn on Email/Password sign-in

1. In the left sidebar: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password** (the first toggle, not the passwordless link option).

## 3. Create the Firestore database

1. Left sidebar: **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (we'll set proper rules next), pick any region close to you.
3. Once it's created, go to the **Rules** tab and replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /entries/{entryId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

This means: every person can only ever read or write their own data, under `users/{their-own-uid}`. Click **Publish**.

## 4. Add your config to the app

Open `firebase-config.js` and replace the placeholder values with the real ones from step 1:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

This file is safe to commit and make public — it's not a secret. Firestore security rules (step 3) are what actually protect your data, not hiding this config.

## 5. Push to GitHub and turn on Pages

1. Create a new repo on GitHub (e.g. `daily-log`) and push these four files to it.
2. In the repo: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`. Save.
4. GitHub will give you a URL like `https://yourusername.github.io/daily-log/` — that's your app, live in a minute or two.

## 6. Authorize the domain in Firebase

Firebase blocks auth requests from domains it doesn't recognize:

1. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Add `yourusername.github.io`.

That's it — open your GitHub Pages URL, create an account, and start logging.

---

## How the data is structured

```
users/{uid}                        → { calorieGoal, proteinGoal }
users/{uid}/entries/{YYYY-MM-DD}   → { date, calories, protein, updatedAt }
```

A few deliberate choices to keep this easy to extend later:

- **The document ID is the date itself** (`2026-07-18`), so logging the same day twice overwrites rather than duplicates, and entries sort naturally.
- **Data is queried with `orderBy("date", "desc")`**, so "most recent on top" comes straight from Firestore rather than being sorted in the browser.
- **Numbers are stored as plain numbers**, not strings, and dates as sortable ISO strings — both are exactly what a charting library (e.g. Chart.js) would want as input, with zero reshaping needed.

When you're ready to add graphs, you'd query a date range from `entries` and hand `date`/`calories`/`protein` straight to a chart. Nothing about the current schema needs to change for that.

## Local testing before you deploy

Because this uses ES module imports, opening `index.html` directly (`file://`) won't work in most browsers. Run a tiny local server from the project folder instead, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`. You'll need to temporarily add `localhost` to Firebase's authorized domains (step 6) to test login locally — it's usually there by default.
