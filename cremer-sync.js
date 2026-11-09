// Sign-in and live sync for Cremer Recipes, through the Firestore database the
// LineUp (JDE Sched) and Packaging Lead Hub apps use (project
// jde-schedule-database).
//
// Two shared logins of its own, separate from every other app's:
//   Mech   cremer-mech@jde-sched.local    look up, copy and print recipes
//   Super  cremer-super@jde-sched.local   the same, plus Manage
// Their passwords are set in the Firebase console (Authentication → Users).
// Being @jde-sched.local accounts, LineUp's sign-in check (allowedNetworksOnly
// in the JDE-Sched repository) refuses them from networks that aren't on
// LineUp's list, once that check is turned on.
//
// Like LineUp, a sign-in lasts until the app is closed, or for 12 hours with
// "Remember this computer".
//
// Firestore:
//   cremer-recipes/{id}  one document per recipe (removed ones are kept, marked removed)
//   cremer-history/{id}  one document per change made in Manage, never changed
// The Firestore rules in README.md enforce all of this, whatever the page does.
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
  const DOMAIN = "jde-sched.local";
  const ACCOUNT = { mech: "cremer-mech", super: "cremer-super" };
  const ROLE_OF = { "cremer-mech": "mech", "cremer-super": "super" };
  const REMEMBER_HOURS = 12;
  const RECIPES = "cremer-recipes";
  const HISTORY = "cremer-history";
  const HISTORY_LIMIT = 500;

  let fs = null, db = null, authMod = null, auth = null;
  let handlers = null;
  let unsubs = [];
  let meta = { recipes: null };
  let failed = null;
  let me = null; // { uid, name, role }

  const docId = key => encodeURIComponent(key).replace(/\./g, "%2E");
  const iso = ts => ts && ts.toDate ? ts.toDate().toISOString() : null;
  const nameOf = user => (user && user.email || "").toLowerCase().split("@")[0];

  /* ---- how long this computer stays unlocked ---- */
  const REMEMBER_KEY = "cremer.rememberUntil", LEFT_KEY = "cremer.leftAt";
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } },
               set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };
  const rememberedUntil = () => Number(ls.get(REMEMBER_KEY)) || 0;
  const rememberExpired = () => rememberedUntil() > 0 && Date.now() > rememberedUntil();
  // Browsers that reopen closed tabs bring the tab's sign-in back with it: the
  // tab notes when it was left, and if it comes back later than a refresh
  // would take, it was closed, so it starts locked (as LineUp does).
  addEventListener("pagehide", () => { try { sessionStorage.setItem(LEFT_KEY, String(Date.now())); } catch {} });
  const leftAt = () => { try { return Number(sessionStorage.getItem(LEFT_KEY)) || 0; } catch { return 0; } };
  const reopenedAfterClose = () => rememberedUntil() === 0 && leftAt() > 0 && Date.now() - leftAt() > 30000;

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
    failed = err && err.code === "permission-denied" ? "Database access denied" : "Database unavailable";
    report();
    if (handlers) handlers.onError(err && err.code === "permission-denied"
      ? "The database refused this. The Cremer Recipes rules may not be published yet."
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
    // Testing only: on this computer's own address, ?emulator=AUTH,FIRESTORE
    // (ports) uses the Firebase emulators instead of the real project.
    const emu = new URLSearchParams(location.search).get("emulator");
    if (emu && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      const [ap, fp] = emu.split(",");
      aMod.connectAuthEmulator(auth, `http://127.0.0.1:${ap}`, { disableWarnings: true });
      fsMod.connectFirestoreEmulator(db, "127.0.0.1", +fp);
    }
  }

  function stop() { unsubs.forEach(u => u()); unsubs = []; meta = { recipes: null }; failed = null; }

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

  // h: onLocked(), onUnlocked({ role, until }), onRecipes(list), onHistory(list),
  //    onStatus(status), onError(message), onUnavailable(message)
  async function start(h) {
    handlers = h;
    try { await loadSdk(); }
    catch (err) { console.error(err); h.onUnavailable("Cremer Recipes couldn't load. Open it from its web address, not from a saved file."); return; }
    try {
      await auth.authStateReady();
      if ((rememberExpired() || reopenedAfterClose()) && auth.currentUser) await authMod.signOut(auth);
      if (rememberExpired()) ls.set(REMEMBER_KEY, null);
    } catch (err) { console.error("Couldn't check the saved sign-in.", err); }
    authMod.onAuthStateChanged(auth, user => {
      stop(); me = null;
      const role = user && nameOf(user).length && user.email.toLowerCase().endsWith("@" + DOMAIN) ? ROLE_OF[nameOf(user)] : null;
      if (!role) { if (user) authMod.signOut(auth); h.onLocked(); return; }
      me = { uid: user.uid, name: nameOf(user), role };
      h.onUnlocked({ role, until: rememberedUntil() });
      listen();
    });
    // A remembered computer locks itself when its 12 hours are up, even if the app is open.
    setInterval(() => { if (auth.currentUser && rememberExpired()) lock(); }, 60 * 1000);
  }

  // Plain-language reason a sign-in failed.
  function unlockError(err, label) {
    const code = err && err.code || "";
    const message = String(err && err.message || "");
    // Refused by LineUp's sign-in check: not from an allowed network.
    if (message.includes("can only be opened from")) {
      const network = (message.match(/This network: ([0-9a-fA-F.:]+)/) || [])[1];
      return `Access restricted. Cremer Recipes can only be used on approved company networks. This device's network${network ? ` (${network})` : ""} is not approved. For access, please contact the LineUp administrator.`;
    }
    if (code === "auth/too-many-requests") return "Too many tries. Wait a few minutes, then try again.";
    if (code === "auth/network-request-failed") return "Can't reach the internet. Check this computer's connection and try again.";
    if (code === "auth/user-disabled") return `The ${label} login has been turned off.`;
    return `That password isn't right for ${label}. Check it and try again.`;
  }

  // role: "mech" or "super". remember: stay unlocked for 12 hours on this
  // computer, even when the app is closed; otherwise until it's closed.
  async function unlock(role, password, remember) {
    const label = role === "super" ? "Super" : "Mech";
    if (!authMod) throw new Error("Cremer Recipes couldn't load. Check the connection and reload.");
    try {
      if (auth.currentUser) await authMod.signOut(auth);
      await authMod.setPersistence(auth, remember ? authMod.browserLocalPersistence : authMod.browserSessionPersistence);
      ls.set(REMEMBER_KEY, remember ? String(Date.now() + REMEMBER_HOURS * 3600 * 1000) : null);
      await authMod.signInWithEmailAndPassword(auth, `${ACCOUNT[role]}@${DOMAIN}`, password);
    } catch (err) {
      ls.set(REMEMBER_KEY, null);
      throw new Error(unlockError(err, label));
    }
  }

  // Locks this computer and removes its offline copy of the recipes.
  async function lock() {
    stop();
    ls.set(REMEMBER_KEY, null);
    await authMod.signOut(auth);
    try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch (err) { console.warn("Couldn't clear the offline copy.", err); }
    location.reload();
  }

  const hasPendingWrites = () => !!(meta.recipes && meta.recipes.hasPendingWrites);

  const stamp = () => ({ at: fs.serverTimestamp(), by: me.name });
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
      await b.commit();
    }
    const h = fs.writeBatch(db);
    h.set(fs.doc(fs.collection(db, HISTORY)), histDoc({ action: "imported", fg: "Recipe file", fields: [`${fresh.length} recipes`] }));
    await h.commit();
    return { added: fresh.length, skipped: recs.length - fresh.length };
  }

  return { start, unlock, lock, hasPendingWrites, saveRecipe, setRemoved, importRecipes, docId };
})();
