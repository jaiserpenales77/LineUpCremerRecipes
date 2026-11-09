// cremerRecipes: hands the Cremer recipes (and the update history) to devices
// on the plant network, so the lookup needs no sign-in there.
//
// - Allowed addresses: the same list as LineUp's sign-in check, the Firestore
//   document jde-sched-access/network: `allowed` (set in the Firebase console,
//   e.g. "203.0.113.7", "203.0.113.0/24") plus the home networks Owners allow
//   for 30 days from the Hub (`temporary`). No app can read or change it.
//   LineUp's `enabled` switch doesn't apply here: the list is always checked.
// - Anyone else gets 403. `?ip` shows the address the function sees, to fill
//   in that list.
// - Reads are kept low: the recipes are re-read only when cremer/meta (stamped
//   by every change made in Manage) says something changed.
const { onRequest } = require("firebase-functions/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { clientIp, isAllowed, allowedNow } = require("./ip");

initializeApp();
const db = getFirestore();

const ORIGIN = "https://jaiserpenales77.github.io";
const EMULATED = process.env.FUNCTIONS_EMULATOR === "true";
const HISTORY_LIMIT = 200;
const ACCESS_TTL = 30 * 1000; // re-read the allowed addresses at most every 30 s
const META_TTL = 10 * 1000;   // check for changes at most every 10 s

const NETWORK_DOC = "jde-sched-access/network";
let access = { at: 0, settings: null };
async function allowedList() {
  if (Date.now() - access.at >= ACCESS_TTL) {
    const d = await db.doc(NETWORK_DOC).get();
    access = { at: Date.now(), settings: d.exists ? d.data() : null };
  }
  return allowedNow(access.settings);
}

const iso = t => (t && t.toDate ? t.toDate().toISOString() : null);
let cache = { rev: null, checked: 0, body: null };
async function payload() {
  if (cache.body && Date.now() - cache.checked < META_TTL) return cache.body;
  const meta = await db.doc("cremer/meta").get();
  const at = meta.exists ? meta.get("at") : null;
  const rev = at && at.toMillis ? at.toMillis() : 0;
  if (cache.body && rev === cache.rev) { cache.checked = Date.now(); return cache.body; }
  const [rs, hs] = await Promise.all([
    db.collection("cremer-recipes").get(),
    db.collection("cremer-history").orderBy("at", "desc").limit(HISTORY_LIMIT).get()
  ]);
  const recipes = rs.docs.map(d => ({ ...d.data(), k: d.id, at: iso(d.get("at")) }));
  const history = hs.docs.map(d => { const { uid, ...h } = d.data(); return { ...h, id: d.id, at: iso(h.at) }; });
  cache = { rev, checked: Date.now(), body: JSON.stringify({ rev, recipes, history }) };
  return cache.body;
}

exports.cremerRecipes = onRequest({ region: "us-central1", memory: "256MiB", maxInstances: 5, invoker: "public" }, async (req, res) => {
  const origin = req.get("origin");
  if (origin === ORIGIN || (EMULATED && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || ""))) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.set("Access-Control-Allow-Methods", "GET"); res.status(204).send(""); return; }
  if (req.method !== "GET") { res.status(405).send(""); return; }

  // The emulator passes no address on; there it is this computer.
  const ip = clientIp(req) || (EMULATED ? "127.0.0.1" : "");
  if ("ip" in req.query) { res.json({ ip }); return; }
  try {
    if (!isAllowed(ip, await allowedList())) { res.status(403).json({ error: "off-site", ip }); return; }
    res.type("application/json").send(await payload());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "unavailable" });
  }
});
