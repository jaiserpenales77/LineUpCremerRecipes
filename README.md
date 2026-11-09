# LineUp · Cremer Recipes

Cremer counter settings for every FG and bulk item on Lines 9 and 10, as a live
web app: **https://jaiserpenales77.github.io/LineUpCremerRecipes/**

It is the `cremer-recipes.html` app that was shared in Teams, with these changes:

- **No sign-in on the plant network.** Devices whose public IP address is on
  the plant's list open the recipes straight away. Anywhere else the app shows
  "Only on the plant network". The check runs on the server (the
  `cremerRecipes` Cloud Function), not in the page, so it can't be bypassed by
  copying the page.
- **The recipes live in the database, not in the file.** They are in Firebase
  Firestore (project `jde-schedule-database`, shared with Packaging Lead Hub and
  JDE Sched). This repository is public, so it holds only the app; the recipe
  data never goes in it (`.gitignore` blocks `cremer-recipes*.html`).
- **Manage needs a sign-in** with a Packaging Lead Hub account (Lead, Admin or
  Owner), instead of the old password.
- **Changes reach everyone.** Edits, new recipes, removals and restores in
  Manage save straight to the database. Signed-in screens update within a
  second; screens on the plant network without a sign-in pick them up within a
  minute (and whenever the app is brought back into view). The update history
  shows who made each change. There is no "Download updated file" step any more.

Everything else is the same: search, line and size filters, the recipe window,
Copy, Print, "Have better settings?" sheets, the update history panel, light
and dark theme.

## Who can do what

| Who | Cremer Recipes |
|---|---|
| **Anyone on the plant network** (no sign-in) | Look up, copy and print recipes; print suggestion sheets. |
| **Off the plant network**, not signed in | Nothing: "Only on the plant network". |
| **PLT** account (every new Packaging Lead Hub account) | Nothing extra; off-site it sees "No access off-site". |
| **MLT** account, signed in | Look up recipes from anywhere, with live updates. |
| **Lead**, **Admin**, **Owner**, signed in | All of that, plus **Manage**: add, edit, remove, restore and import recipes. |

Sign in on the **Manage** tab (or on the off-site screen); sign out with the
initial in the top bar. Account types are changed in Packaging Lead Hub's Admin
tab; Owners are the `owners` list in the `pk030/admins` document. The Firestore
rules below and the function enforce all of this, whatever the page does.

## How the plant-network check works

`functions/index.js` is an HTTPS Cloud Function, `cremerRecipes`
(`https://us-central1-jde-schedule-database.cloudfunctions.net/cremerRecipes`).
The app asks it for the recipes. It looks at the address the request came from
and answers only if that address is in the `allowedIps` list of the Firestore
document `cremer/access`. Everyone else gets 403, and the database itself
refuses to hand the recipes to anyone who isn't signed in.

- Addresses can be single (`203.0.113.7`) or ranges (`203.0.113.0/24`), IPv4 or
  IPv6 (`2001:db8:1234::/48`). An empty or missing list lets nobody in.
- The list is read again every 30 seconds, so changes need no redeploy.
- Opening the function's address with `?ip` at the end shows the address it
  sees for that device. Use it on a plant PC to find the address to allow.
- Only the address added by Google's own front end is trusted, so a device
  can't pretend to be on the plant network by sending a made-up header.
- It only works on devices using the plant's internet connection: phones on
  mobile data, home computers and possibly VPN connections are "off-site".
  If the plant's public address changes, update the list.
- To keep database reads low, the function re-reads the recipes only when
  `cremer/meta` (stamped by every change in Manage) says something changed.
  Normal use stays inside Firestore's free daily allowance. Cloud Functions
  needs the Blaze plan; at this app's traffic it should cost nothing, and a
  budget alert in Google Cloud billing is a good safety net.

## One-time setup

1. **Turn on GitHub Pages:** repository **Settings → Pages → Build and
   deployment → Source: GitHub Actions**, then re-run the "Deploy static site
   to GitHub Pages" workflow in the **Actions** tab. After that, every push to
   `claude/practical-pascal-31ea52` publishes the site.
2. **Publish the Firestore rules:** Firebase console, project
   `jde-schedule-database` → **Firestore Database → Rules** → replace them with
   the contents of [`firestore.rules`](firestore.rules) (also below) →
   **Publish**. That file is the full rule set: the JDE Sched and Packaging Lead
   Hub rules exactly as they are in the AutoCoordinator README, plus the Cremer
   Recipes section at the end. Whenever the rules change in either app, keep
   both sections, and update the copy in the AutoCoordinator README too.
3. **Deploy the function** (needs the Blaze plan). The easiest way is Google
   Cloud Shell, which runs in the browser with nothing to install: open
   https://shell.cloud.google.com, signed in with the Google account that owns
   the Firebase project, and run:

   ```bash
   git clone -b claude/practical-pascal-31ea52 https://github.com/jaiserpenales77/LineUpCremerRecipes.git
   cd LineUpCremerRecipes/functions && npm ci && cd ..
   npx firebase-tools@latest deploy --only functions --project jde-schedule-database
   ```

   If it asks you to log in, run `npx firebase-tools@latest login --no-localhost`
   and follow the link, then run the deploy line again. The first deploy can
   take a few minutes, turns on the Google Cloud services functions need, and
   may ask about a cleanup policy for old builds (accept the default). The
   functions are in their own codebase (`cremer-recipes`), so deploying never
   touches other functions in the project. Deploy again whenever
   `functions/` changes.
4. **Allow the plant's address:** on a PC on the plant network, open
   https://us-central1-jde-schedule-database.cloudfunctions.net/cremerRecipes?ip
   and note the address. In the Firebase console → **Firestore Database →
   Data** → start (or open) the collection `cremer` → add a document with ID
   `access` and a field `allowedIps` of type **array**, with the address as a
   string element. Add every address or range the plant uses (ask IT; if the
   PC shows an IPv6 address, the plant's IPv6 range, for example a `/48` or
   `/56`, is safer than one address). Within 30 seconds, devices on those
   addresses open the recipes without signing in.
5. **Sign-in domain:** `jaiserpenales77.github.io` must be in **Authentication
   → Settings → Authorized domains**. It is already there if Packaging Lead
   Hub signs in from GitHub Pages.
6. **Load the recipes once:** open the app, go to **Manage**, sign in as a
   Lead, Admin or Owner → **Import recipe file** → choose `cremer-recipes.html`
   (the file from Teams). It adds the recipes the database doesn't have yet and
   never changes stored ones, so importing again is safe. If someone has unsaved
   Manage changes in that file on their own computer, have them tap **Download
   updated file** there first and import that file instead.

## Database layout

- `cremer-recipes/{id}`: one document per recipe. It holds the recipe's
  fields (`fg`, `bulk`, `line`, `size`, `sheet`, `id` and the settings), plus
  `fromGuide` (it came from an imported file), `edited`, `removed` (removed
  recipes are kept so they can be restored), `at` (server time of the last
  change) and `by` (username). The id of an imported recipe is its
  `line|sheet`, URL-encoded, so a second import can't duplicate it; recipes
  added in Manage get `new-…` ids. Nobody can delete a document.
- `cremer-history/{id}`: one entry per change (`added`, `edited`, `removed`,
  `restored`, `imported`), stamped with the account and server time; entries
  are never changed or deleted. Signed-in screens show the newest 500, the
  plant-network screens the newest 200.
- `cremer/meta`: `at` and `by` of the latest change, written with every change.
- `cremer/access`: `allowedIps`, the plant's addresses. Firebase console only.

Signed-in screens keep an offline copy (Firestore's IndexedDB cache): if the
network drops they keep showing the last recipes, and changes made offline are
sent when it comes back. **Sign out** clears that copy from the computer.
Plant-network screens keep the last recipes they fetched while the page stays
open, and say "Offline" until the connection returns.

## Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // JDE Sched: each shift's data opens only with that shift's password.
    // The accounts are 1st@jde-sched.local, 2nd@jde-sched.local and
    // 3rd@jde-sched.local (created in the Firebase console). Any other
    // account - including Packaging Lead Hub accounts - gets nothing.
    function jdeShiftAccount(shift) {
      return request.auth != null
        && shift in ['1st', '2nd', '3rd']
        && request.auth.token.email == shift + '@jde-sched.local';
    }
    match /jde-sched/{shift} {
      allow read, write: if jdeShiftAccount(shift);
    }
    match /jde-sched/{shift}/{rest=**} {
      allow read, write: if jdeShiftAccount(shift);
    }

    // Packaging Lead Hub. Accounts are username@pk030.local.
    function signedIn() {
      return request.auth != null
        && request.auth.token.email.matches('[^@]+@pk030[.]local');
    }
    function username() {
      return request.auth.token.email.split('@')[0];
    }
    function doc(path) {
      return /databases/$(database)/documents/pk030/$(path);
    }
    // Owners: the usernames in pk030/admins "owners" (Firebase console only).
    function owners() {
      return exists(doc('admins')) ? get(doc('admins')).data.get('owners', []) : [];
    }
    function isOwner() {
      return signedIn() && username() in owners();
    }
    // Everyone else's account type is in their pk030-users record.
    function myRole() {
      let me = /databases/$(database)/documents/pk030-users/$(request.auth.uid);
      return exists(me) ? get(me).data.role : 'none';
    }
    function isAdmin() {
      return isOwner() || (signedIn() && myRole() == 'admin');
    }
    function isLead() {
      return isAdmin() || (signedIn() && myRole() == 'lead');
    }
    // A Lead's change to Stored Data: only new bulk/FG items and line rates,
    // none changed or removed.
    function onlyAddsItems() {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['bulkItems', 'fgItems', 'lineRates'])
        && onlyAdds('bulkItems') && onlyAdds('fgItems') && onlyAdds('lineRates');
    }
    function onlyAdds(field) {
      let change = request.resource.data.get(field, {}).diff(resource.data.get(field, {}));
      return change.removedKeys().size() == 0 && change.changedKeys().size() == 0;
    }
    // Usernames an admin has linked to a lead.
    function linkedToLead() {
      return exists(doc('storedData'))
        && username() in get(doc('storedData')).data.get('leadUsers', {});
    }

    // Saved yield sheets: Lead and up.
    match /pk030-yield-sheets/{id} {
      allow read, write: if isLead();
    }
    // Stored Data: Leads read it and add new bulk/FG items and line rates;
    // only admins change or remove them, and change leads and their usernames.
    match /pk030/storedData {
      allow read: if isLead();
      allow create: if isAdmin()
        || (isLead() && request.resource.data.keys().hasOnly(['bulkItems', 'fgItems', 'lineRates']));
      allow update: if isAdmin() || (isLead() && onlyAddsItems());
      allow delete: if isAdmin();
    }
    // The owners list: read by the app, changed only in the Firebase console.
    match /pk030/admins {
      allow read: if signedIn();
      allow write: if false;
    }
    // Account records. A new account makes its own as a PLT (or as a Lead if
    // an admin already linked its username to a lead). Admins change account
    // types; only owners change an admin's; nobody changes their own.
    match /pk030-users/{uid} {
      allow read: if signedIn() && (uid == request.auth.uid || isAdmin());
      allow create: if signedIn() && uid == request.auth.uid
        && request.resource.data.keys().hasOnly(['username', 'name', 'role', 'createdAt'])
        && request.resource.data.username == username()
        && request.resource.data.name is string
        && request.resource.data.name.size() <= 60
        && request.resource.data.createdAt == request.time
        && (request.resource.data.role == 'plt'
          || (request.resource.data.role == 'lead' && linkedToLead()));
      allow update: if isAdmin() && uid != request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['role'])
        && request.resource.data.role in ['plt', 'mlt', 'lead', 'admin']
        && !(resource.data.username in owners())
        && (isOwner() || resource.data.role != 'admin');
      allow delete: if false;
    }
    // Activity log: everyone signed in adds entries as themselves; only
    // admins read it; nobody changes or deletes entries.
    match /pk030-activity/{id} {
      allow read: if isAdmin();
      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['uid', 'username', 'action', 'detail', 'at'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.username == username()
        && request.resource.data.action is string
        && request.resource.data.action.size() <= 60
        && request.resource.data.detail is string
        && request.resource.data.detail.size() <= 300
        && request.resource.data.at == request.time;
      allow update, delete: if false;
    }
    // Cremer Recipes (LineUpCremerRecipes). Devices on the plant network get
    // the recipes from the cremerRecipes function (which checks their IP
    // address against cremer/access), with no sign-in. Signed in with a
    // Packaging Lead Hub account, MLT and up read them here from anywhere;
    // Lead and up add, change, remove (marked removed, never deleted) and
    // restore them. Every write is stamped with the account and server time.
    function cremerReader() {
      return isOwner() || (signedIn() && myRole() in ['mlt', 'lead', 'admin']);
    }
    function cremerStamped(d) {
      return d.by == username() && d.at == request.time;
    }
    function cremerRecipeOk() {
      let d = request.resource.data;
      return d.keys().hasOnly([
          'id', 'fg', 'bulk', 'line', 'size', 'sheet', 'length', 'width',
          'transparent', 'count', 'precount', 'maxReject', 'channelWidth',
          'overcount', 'dosingSpeed', 'dosingStartPos', 'dosingStartSpeed', 'bpm',
          'speedBalance', 'beltSpeed', 'handlingDischarge', 'rearSpeed', 'rearPulse',
          'rearInterval', 'frontSpeed', 'frontAmp', 'dischargeTime',
          'dischargeIntervals', 'dischargeMode', 'precountFlap', 'modules',
          'ejector', 'ionizer', 'upsideSensor', 'diameter', 'screwHeight',
          'screwAngle', 'pockets', 'gateOpen', 'gateClose', 'sideSensor', 'funnel',
          'fromGuide', 'edited', 'removed', 'at', 'by'
        ])
        && d.keys().hasAll(['fg', 'line', 'size', 'sheet', 'fromGuide', 'edited', 'removed', 'at', 'by'])
        && d.fg is string && d.fg.size() > 0 && d.fg.size() <= 40
        && d.sheet is string && d.sheet.size() <= 120
        && d.line is int && d.size is int
        && d.fromGuide is bool && d.edited is bool && d.removed is bool
        && cremerStamped(d);
    }
    match /cremer-recipes/{id} {
      allow read: if cremerReader();
      allow create, update: if isLead() && cremerRecipeOk();
      allow delete: if false;
    }
    match /cremer-history/{id} {
      allow read: if cremerReader();
      allow create: if isLead()
        && request.resource.data.keys().hasOnly(['action', 'k', 'fg', 'bulk', 'line', 'size', 'fields', 'uid', 'at', 'by'])
        && request.resource.data.action in ['added', 'edited', 'removed', 'restored', 'imported']
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.fields is list && request.resource.data.fields.size() <= 60
        && cremerStamped(request.resource.data);
      allow update, delete: if false;
    }
    // When the recipes last changed: stamped with every change, so the
    // function knows when to read them again.
    match /cremer/meta {
      allow read: if cremerReader();
      allow write: if isLead()
        && request.resource.data.keys().hasOnly(['at', 'by'])
        && cremerStamped(request.resource.data);
    }
    // The plant's IP addresses (allowedIps): Firebase console only.
    match /cremer/access {
      allow read, write: if false;
    }
  }
}
```

## Files

- `index.html`: the app (layout, styles, search, recipe window, printing,
  Manage, history). The setting names are built in; the recipes are not.
- `cremer-sync.js`: getting the recipes (from the function, or from Firestore
  when signed in), sign-in and saving changes.
- `functions/`: the `cremerRecipes` Cloud Function (`index.js`) and its IP
  address check (`ip.js`, tested by `ip.test.js`: `npm test` in `functions/`).
- `assets/vendor/firebase/`: the Firebase JS SDK 12.19.0 (same copy as
  Packaging Lead Hub), served from this site.
- `firestore.rules`, `firebase.json`: the rules, the function's deploy settings
  and the emulator settings.
- `.github/workflows/deploy-pages.yml`: publishes the site to GitHub Pages.

## Testing without touching the real database

Install the function's packages (`npm ci` in `functions/`), start the Firebase
emulators (needs Java) with
`npx firebase-tools emulators:start --only auth,firestore,functions --project jde-schedule-database`,
serve the folder (`python3 -m http.server 8000`), and open
`http://localhost:8000/?emulator=9099,8080,5001`. The `emulator` parameter is
ignored anywhere except `localhost`, so the live site always uses the real
database and function. In the emulator the function treats every caller as
`127.0.0.1`; put that in `cremer/access` to test the plant-network view.
