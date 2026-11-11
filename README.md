# LineUp · Cremer Recipes

Cremer counter settings for every FG and bulk item on Lines 9 and 10, as a live
web app: **https://jaiserpenales77.github.io/LineUpCremerRecipes/**

It is the `cremer-recipes.html` recipe file turned into a web app, with these changes:

- **Two passwords of its own, Mech and Super**, separate from every other app.
  The app opens locked; pick **Mech** or **Super** and type its password.
- **Only from approved networks.** LineUp's sign-in check refuses both logins
  from networks that aren't on LineUp's list (the company's, and Owners' homes
  allowed from the Hub), even with the right password.
- **The recipes live in the database, not in the file.** They are in Firebase
  Firestore (project `jde-schedule-database`, shared with LineUp and Packaging
  Lead Hub). This repository is public, so it holds only the app; the recipe
  data never goes in it (`.gitignore` blocks `cremer-recipes*.html`).
- **Changes reach everyone live.** Edits, new recipes, removals and restores
  in Manage save straight to the database, and every open screen updates
  within a second. The update history shows each change. There is no
  "Download updated file" step any more.

Everything else is the same: search, line and size filters, the recipe window,
Copy, Print, "Have better settings?" sheets, the update history panel, light
and dark theme.

## Who can do what

| Login | Firebase account | Can |
|---|---|---|
| **Mech** | `cremer-mech@jde-sched.local` | Look up, copy and print recipes; print suggestion sheets. |
| **Super** | `cremer-super@jde-sched.local` | All of that, plus **Manage**: add, edit, remove, restore and import recipes. |

No other account opens Cremer Recipes: not LineUp's shift accounts, not
Packaging Lead Hub accounts. And the two Cremer logins can't open anything in
the other apps. The Firestore rules below enforce this, whatever the page does.

Like LineUp, an unlocked computer stays unlocked until the app is closed, or
for **12 hours** with **Remember this computer for 12 hours**. The initial in
the top bar (M or S) shows who is unlocked; clicking it **locks** the app and
clears the downloaded recipes from that computer. Changes made with Super show
as "by Super" in the history; the two logins are shared, so the history can't
tell which supervisor it was.

## Excel version

**⬇ Download Excel version** (under the title, for Mech and Super) saves
`Cremer Recipes YYYY-MM-DD.xlsx`: the Excel recipe finder, filled with the
recipes as they are in the app at that moment.

- **Find Recipe**: search by FG item, bulk, or either; filter by line and
  bottle size; pick between matches; a recipe card that prints on one page.
  It is 1.35 times the size of the original workbook's page (columns, rows,
  text and logo), so it fills more of the screen; `SCALE` in
  `tools/build_excel_template.py` sets it.
- **Recipes**: every recipe and setting, with last-updated date and source.
- **Update History**: the changes made in Manage (newest first, up to 194),
  then the import from the recipe guides.
- **How to Use**, and **Lists** (the lines, sizes and paper colours).

The copy says when it was downloaded and doesn't update itself; changes are
made in the app (Super → Manage), and changes typed into the file stay in
that file. All sheets are protected like the original workbook.

How it's made: `assets/excel/cremer-recipes-template.xlsx` is that workbook
(built in the Packaging Lead Hub session) with every recipe value removed, so
the public repository holds no recipe data. `excel-export.js` fills its
Recipes rows and Update History in the browser with JSZip
(`assets/vendor/jszip/`) and hands the file over; nothing is sent anywhere.
To change the workbook's layout, edit the original workbook and rebuild the
template with `tools/build_excel_template.py ORIGINAL.xlsx cremer-recipes.html
assets/excel/cremer-recipes-template.xlsx`: it checks that every Recipes column
lines up with the app's settings, empties the recipe rows, and refuses to
write the template if any recipe value is left in it. Keep both input files out
of the repository.

Anyone who can unlock the app can download the whole recipe list this way,
and the file works anywhere: the network check covers the app, not copies
taken from it.

## How the network check works

The two Cremer accounts are `@jde-sched.local` accounts, and LineUp's sign-in
check, the `allowedNetworksOnly` function in the JDE-Sched repository (see its
`docs/NETWORK_ACCESS_PLAN.md`), checks every `@jde-sched.local` sign-in. When
it is turned on, a sign-in from a network that isn't on LineUp's list
(`jde-sched-access/network`) is refused, whatever the password, and the lock
screen says: "Access restricted. Cremer Recipes can only be used on approved
company networks. This device's network (…) is not approved. For access,
please contact the LineUp administrator."

- **One list for both apps:** the company address in `allowed`, and the home
  networks Owners allow for 30 days with the Hub's **Admin → LineUp: Network
  Access → Allow LineUp from this network** button.
- **It follows LineUp's `enabled` switch.** While it is off (as during
  LineUp's setup), the passwords work from anywhere; once it is on, both apps
  are network-locked.
- **It checks the moment of unlocking.** A computer that is already unlocked
  keeps working until it locks (when the app is closed, or after 12 hours if
  remembered).
- Cremer Recipes needs no function of its own: LineUp's setup (Identity
  Platform and its Cloud Shell deploy) covers it.

## One-time setup

1. **GitHub Pages** (done): repository **Settings → Pages → Source: GitHub
   Actions**. Every push to `claude/practical-pascal-31ea52` publishes the site.
2. **Publish the Firestore rules:** Firebase console, project
   `jde-schedule-database` → **Firestore Database → Rules** → replace them with
   the contents of [`firestore.rules`](firestore.rules) (also below) →
   **Publish**. That file is the full rule set: the JDE Sched (LineUp) and
   Packaging Lead Hub rules combined (the JDE-Sched repository's
   `firestore.rules` and the AutoCoordinator README each hold only part of
   what is published now), plus the Cremer Recipes section. **Paste this file,
   not the copy from JDE-Sched or the AutoCoordinator README**, or the other
   apps' newest rules or Cremer's would be dropped. Whenever the rules change
   in any of the three apps, give that change to all three copies.
3. **Create the two logins:** Firebase console → **Authentication → Users →
   Add user**:
   - email `cremer-mech@jde-sched.local`, with the Mech password;
   - email `cremer-super@jde-sched.local`, with the Super password.

   Passwords need at least 6 characters. To change one later, delete that
   user and add it again with the new password (the console's "Reset
   password" sends an email, which can't reach a `.local` address).
   Computers unlocked with the old password lock within about an hour.
4. **Network check:** part of LineUp's setup (its `docs/NETWORK_ACCESS_PLAN.md`):
   upgrade to Identity Platform, deploy its functions from Cloud Shell, then
   turn `enabled` on. Nothing extra for Cremer Recipes.
5. **Load the recipes once:** open the app, unlock as **Super** → **Manage** →
   **Import recipe file** → choose the `cremer-recipes.html` recipe file.
   It adds the recipes the database doesn't have yet and never changes stored
   ones, so importing again is safe. If someone has unsaved Manage changes in
   that file on their own computer, have them tap **Download updated file**
   there first and import that file instead.

## Database layout

- `cremer-recipes/{id}`: one document per recipe. It holds the recipe's
  fields (`fg`, `bulk`, `line`, `size`, `sheet`, `id` and the settings), plus
  `fromGuide` (it came from an imported file), `edited`, `removed` (removed
  recipes are kept so they can be restored), `at` (server time of the last
  change) and `by` (`cremer-super`). The id of an imported recipe is its
  `line|sheet`, URL-encoded, so a second import can't duplicate it; recipes
  added in Manage get `new-…` ids. Nobody can delete a document.
- `cremer-history/{id}`: one entry per change (`added`, `edited`, `removed`,
  `restored`, `imported`), stamped with the account and server time; entries
  are never changed or deleted. The app shows the newest 500.

An unlocked computer keeps an offline copy (Firestore's IndexedDB cache): if
the network drops it keeps showing the last recipes, and changes made offline
are sent when it comes back. **Lock** clears that copy from the computer.

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
    // Any of the three shift accounts: they read the Packaging Lead Hub's
    // Stored Data (only to read its Line Rates, for the estimated changeover
    // times) and can't change it.
    function jdeAnyShiftAccount() {
      return request.auth != null
        && request.auth.token.email in ['1st@jde-sched.local', '2nd@jde-sched.local', '3rd@jde-sched.local'];
    }
    // Each shift's people's names - only the names - so another shift can
    // pick them for overtime. Any shift reads all three lists; a shift
    // writes only its own. Schedules, boards, time off and skills stay in
    // each shift's private document above.
    match /jde-sched-names/{shift} {
      allow read: if jdeAnyShiftAccount();
      allow write: if jdeShiftAccount(shift)
        && request.resource.data.keys().hasOnly(['names'])
        && request.resource.data.names is list
        && request.resource.data.names.size() <= 1000;
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
    // JDE Sched's shift accounts can also read it (Line Rates).
    match /pk030/storedData {
      allow read: if isLead() || jdeAnyShiftAccount();
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
    // Cremer Recipes (LineUpCremerRecipes). Two shared logins of its own,
    // made in the Firebase console: Mech (cremer-mech@jde-sched.local) reads
    // the recipes and their update history; Super
    // (cremer-super@jde-sched.local) also adds, changes, removes (marked
    // removed, never deleted) and restores them. No other account - LineUp's
    // shift accounts, Packaging Lead Hub accounts - gets any of it, and these
    // two get nothing else. Being @jde-sched.local accounts, LineUp's sign-in
    // check only lets them sign in from its allowed networks. Every write is
    // stamped with the account and the server time.
    function cremerAccount() {
      return request.auth != null
        && request.auth.token.email in ['cremer-mech@jde-sched.local', 'cremer-super@jde-sched.local'];
    }
    function cremerSuper() {
      return request.auth != null && request.auth.token.email == 'cremer-super@jde-sched.local';
    }
    function cremerStamped(d) {
      return d.by == request.auth.token.email.split('@')[0] && d.at == request.time;
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
      allow read: if cremerAccount();
      allow create, update: if cremerSuper() && cremerRecipeOk();
      allow delete: if false;
    }
    match /cremer-history/{id} {
      allow read: if cremerAccount();
      allow create: if cremerSuper()
        && request.resource.data.keys().hasOnly(['action', 'k', 'fg', 'bulk', 'line', 'size', 'fields', 'uid', 'at', 'by'])
        && request.resource.data.action in ['added', 'edited', 'removed', 'restored', 'imported']
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.fields is list && request.resource.data.fields.size() <= 60
        && cremerStamped(request.resource.data);
      allow update, delete: if false;
    }
  }
}
```

## Files

- `index.html`: the app (lock screen, layout, styles, search, recipe window,
  printing, Manage, history). The setting names are built in; the recipes are
  not.
- `cremer-sync.js`: unlocking (Mech/Super, remember for 12 hours, LineUp's
  network message), live sync with Firestore and saving changes.
- `excel-export.js`: the **Download Excel version** button's workbook (see
  Excel version).
- `assets/excel/cremer-recipes-template.xlsx`: the Excel recipe finder with no
  recipe data in it; `tools/build_excel_template.py` makes it.
- `assets/vendor/firebase/`: the Firebase JS SDK 12.19.0 (same copy as
  Packaging Lead Hub), served from this site.
- `assets/vendor/jszip/`: JSZip 3.10.1 (MIT), for building the Excel file.
- `firestore.rules`, `firebase.json`: the rules and the emulator settings.
- `.github/workflows/deploy-pages.yml`: publishes the site to GitHub Pages.

## Testing without touching the real database

Start the Firebase emulators (needs Java) with
`npx firebase-tools emulators:start --only auth,firestore --project jde-schedule-database`,
serve the folder (`python3 -m http.server 8000`), and open
`http://localhost:8000/?emulator=9099,8080`. The `emulator` parameter is
ignored anywhere except `localhost`, so the live site always uses the real
project. To test the network check too, run LineUp's `functions/` (from the
JDE-Sched repository) in the same emulators (`--only auth,firestore,functions`)
and set `jde-sched-access/network` in the emulator.
