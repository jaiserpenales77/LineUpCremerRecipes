// Signs people in and keeps the recipes in sync through the Firestore database
// the Packaging Lead Hub and JDE Sched apps use (project jde-schedule-database).
// Accounts are the Packaging Lead Hub's: username@pk030.local, with the account
// type (PLT, MLT, Lead, Admin, Owner) in pk030-users/{uid} and the owners in
// pk030/admins. The recipes are never part of this (public) repository:
//   cremer-recipes/{id}  one document per recipe (removed ones are kept, marked removed)
//   cremer-history/{id}  one document per change made in Manage, never changed
// MLT and up read the recipes; Lead and up change them. The Firestore rules in
// README.md enforce this, whatever the page does.
const CloudSync = (() => {
  // Public by design: access is governed by the Firestore security rules.
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyANgwpQIp6SybjkZgpVtvusTc9SEdkTFeg",
    authDomain: "jde-schedule-database.firebaseapp.com",
    projectId: "jde-schedule-database",
    storageBucket: "jde-schedule-database.firebasestorage.app",
    messagingSenderId: "200523177124",
    appId: "1:200523177124:web:9459478521f146e28d9a31"
  };
  const USERNAME_DOMAIN = "pk030.local";
  const RECIPES = "cremer-recipes";
  const HISTORY = "cremer-history";
  const HISTORY_LIMIT = 500;
  const ROLES = ["plt", "mlt", "lead", "admin", "owner"];
  const atLeast = (role, min) => ROLES.indexOf(role) >= ROLES.indexOf(min);

  let fs = null, db = null, authMod = null, auth = null;
  let handlers = null;
  let unsubs = [];
  let meta = { recipes: null };
  let failed = null;
  let me = null; // { uid, username, role }

  const usernameOf = user => (user.email || "").toLowerCase().replace(`@${USERNAME_DOMAIN}`, "");
  const toEmail = u => { u = u.trim().toLowerCase(); return u.includes("@") ? u : `${u}@${USERNAME_DOMAIN}`; };
  // A recipe's document id: its "line|sheet" key, made safe for Firestore.
  const docId = key => encodeURIComponent(key).replace(/\./g, "%2E");
  const iso = ts => ts && ts.toDate ? ts.toDate().toISOString() : null;

  function status() {
    if (failed) return { state: "error", text: failed };
    if (!meta.recipes) return { state: "connecting", text: "Connecting…" };
    if (meta.recipes.fromCache) return { state: "offline", text: "Offline — showing the last recipes downloaded" };
    if (meta.recipes.hasPendingWrites) return { state: "saving", text: "Saving…" };
    return { state: "synced", text: "Live" };
  }
  const report = () => handlers && handlers.onStatus(status());

  function fail(err) {
    console.error(err);
    failed = err && err.code === "permission-denied"
      ? "Database access denied"
      : "Database unavailable";
    report();
    if (handlers) handlers.onError(err && err.code === "permission-denied"
      ? "The database refused this. Your account may not be allowed to do it, or the Cremer Recipes rules aren't published yet."
      : "Couldn't reach the database. Check the connection and try again.");
  }

  async function loadSdk() {
    const base = new URL("assets/vendor/firebase/", document.baseURI).href;
    const [appMod, fsMod, aMod] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-firestore.js"),
      import(base + "firebase-auth.js")
    ]);
    // Its own app name, so its sign-in and offline copy don't mix with other
    // apps on the same site.
    const app = appMod.initializeApp(FIREBASE_CONFIG, "cremer-recipes");
    const settings = { experimentalAutoDetectLongPolling: true };
    try {
      db = fsMod.initializeFirestore(app, { ...settings, localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
    } catch (err) {
      console.warn("Offline cache unavailable; syncing without it.", err);
      db = fsMod.initializeFirestore(app, settings);
    }
    fs = fsMod; authMod = aMod; auth = aMod.getAuth(app);
    // Testing only: on this computer's own address, ?emulator=PORT,PORT uses
    // the Firebase emulators (auth, firestore) instead of the real database.
    const emu = new URLSearchParams(location.search).get("emulator");
    if (emu && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      const [ap, fp] = emu.split(",");
      aMod.connectAuthEmulator(auth, `http://127.0.0.1:${ap}`, { disableWarnings: true });
      fsMod.connectFirestoreEmulator(db, "127.0.0.1", +fp);
    }
  }

  function stop() { unsubs.forEach(u => u()); unsubs = []; meta = { recipes: null }; failed = null; }

  async function loadAccess(user) {
    const username = usernameOf(user);
    let role = "none";
    try {
      const [rec, admins] = await Promise.all([
        fs.getDoc(fs.doc(db, "pk030-users", user.uid)),
        fs.getDoc(fs.doc(db, "pk030", "admins"))
      ]);
      const owners = admins.exists() ? (admins.data().owners || []) : [];
      if (owners.includes(username)) role = "owner";
      else if (rec.exists()) role = rec.data().role || "none";
    } catch (err) {
      console.error(err);
      if (err.code !== "permission-denied") { handlers.onAccess({ username, role: null, canRead: false, canEdit: false, offline: true }); return null; }
    }
    me = { uid: user.uid, username, role };
    const access = { username, role, canRead: atLeast(role, "mlt"), canEdit: atLeast(role, "lead") };
    handlers.onAccess(access);
    return access;
  }

  function listen() {
    unsubs.push(fs.onSnapshot(fs.collection(db, RECIPES), { includeMetadataChanges: true }, snap => {
      meta.recipes = snap.metadata; failed = null;
      handlers.onRecipes(snap.docs.map(d => {
        const r = d.data({ serverTimestamps: "estimate" });
        return { ...r, k: d.id, at: iso(r.at) };
      }));
      report();
    }, fail));
    const q = fs.query(fs.collection(db, HISTORY), fs.orderBy("at", "desc"), fs.limit(HISTORY_LIMIT));
    unsubs.push(fs.onSnapshot(q, snap => {
      handlers.onHistory(snap.docs.map(d => { const h = d.data({ serverTimestamps: "estimate" }); return { ...h, id: d.id, at: iso(h.at) || new Date().toISOString() }; }));
    }, err => console.error("History unavailable", err)));
  }

  // h: onSignedIn(username), onSignedOut(), onAccess(access), onRecipes(list),
  //    onHistory(list), onStatus(status), onError(message), onUnavailable(message)
  async function start(h) {
    handlers = h;
    try { await loadSdk(); }
    catch (err) { console.error(err); h.onUnavailable("The database library couldn't load. Open the app from its web address, not from a saved file."); return; }
    authMod.onAuthStateChanged(auth, async user => {
      stop(); me = null;
      if (!user) { h.onSignedOut(); return; }
      h.onSignedIn(usernameOf(user));
      const access = await loadAccess(user);
      if (access && access.canRead && auth.currentUser === user) listen();
    });
  }

  async function signIn(username, password) {
    try { await authMod.signInWithEmailAndPassword(auth, toEmail(username), password); }
    catch (err) {
      const wrong = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
      if (wrong.includes(err.code)) throw new Error("Wrong username or password.");
      if (err.code === "auth/too-many-requests") throw new Error("Too many attempts. Wait a few minutes and try again.");
      if (err.code === "auth/network-request-failed") throw new Error("Can't reach the sign-in service. Check the connection.");
      if (err.code === "auth/user-disabled") throw new Error("This account has been disabled.");
      throw new Error(`Sign-in failed (${err.code || err.message}).`);
    }
  }

  // Signs out and removes this computer's offline copy of the recipes.
  async function signOut() {
    stop();
    await authMod.signOut(auth);
    try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch (err) { console.warn("Couldn't clear the offline cache.", err); }
    location.reload();
  }

  const hasPendingWrites = () => !!(meta.recipes && meta.recipes.hasPendingWrites);

  const stamp = () => ({ at: fs.serverTimestamp(), by: me.username });
  const histDoc = entry => ({
    action: entry.action, k: entry.k || "", fg: String(entry.fg ?? ""), bulk: String(entry.bulk ?? ""),
    line: +entry.line || 0, size: +entry.size || 0, fields: (entry.fields || []).map(String),
    uid: me.uid, ...stamp()
  });

  // One change: the recipe document and its history entry, together. Firestore
  // shows it at once and sends it when it can (also after going back online).
  function commit(fn) {
    if (!db || !me) return;
    const b = fs.writeBatch(db);
    fn(b);
    b.commit().catch(fail);
    report();
  }

  // rec: the recipe's fields; key: its id (null for a new one, which gets one).
  function saveRecipe(key, rec, entry) {
    const k = key || "new-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    commit(b => {
      b.set(fs.doc(db, RECIPES, k), { ...rec, ...stamp() });
      b.set(fs.doc(fs.collection(db, HISTORY)), histDoc({ ...entry, k }));
    });
    return k;
  }

  function setRemoved(key, removed, entry) {
    commit(b => {
      b.update(fs.doc(db, RECIPES, key), { removed, ...stamp() });
      b.set(fs.doc(fs.collection(db, HISTORY)), histDoc({ ...entry, k: key }));
    });
  }

  // Adds the recipes that aren't in the database yet (matched by line and
  // workbook sheet); never changes stored ones. Waits for the database.
  async function importRecipes(recs, existingIds) {
    const fresh = [], seen = new Set(existingIds);
    recs.forEach(r => { const id = docId(r.line + "|" + r.sheet); if (!seen.has(id)) { seen.add(id); fresh.push([id, r]); } });
    const put = (b, [id, r]) => b.set(fs.doc(db, RECIPES, id), { ...r, fromGuide: true, edited: false, removed: false, ...stamp() });
    for (let i = 0; i < fresh.length; i += 100) {
      const chunk = fresh.slice(i, i + 100);
      const b = fs.writeBatch(db);
      chunk.forEach(x => put(b, x));
      try { await b.commit(); }
      catch (err) {
        // The rules look up the account for every document; if a big batch
        // goes over Firestore's per-request lookup limit, send them one by one.
        if (err.code !== "permission-denied") throw err;
        for (const x of chunk) { const one = fs.writeBatch(db); put(one, x); await one.commit(); }
      }
    }
    const h = fs.writeBatch(db);
    h.set(fs.doc(fs.collection(db, HISTORY)), histDoc({ action: "imported", fg: "Recipe file", fields: [`${fresh.length} recipes`] }));
    await h.commit();
    return { added: fresh.length, skipped: recs.length - fresh.length };
  }

  return { start, signIn, signOut, hasPendingWrites, saveRecipe, setRemoved, importRecipes, docId };
})();
