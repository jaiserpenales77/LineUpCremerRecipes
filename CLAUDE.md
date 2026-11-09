# LineUp · Cremer Recipes

Static web app (no build step) published to GitHub Pages from branch
`claude/practical-pascal-31ea52`; the whole repository is published, and it is
public. Recipes live in Firestore (project `jde-schedule-database`, shared with
LineUp/JDE Sched and Packaging Lead Hub). Two shared logins of its own: Mech
(`cremer-mech@jde-sched.local`, read) and Super (`cremer-super@jde-sched.local`,
read and Manage). LineUp's sign-in check (`allowedNetworksOnly` in the
JDE-Sched repo) network-locks them. See README.md.

- Never commit recipe data (a `cremer-recipes.html` with recipes built in, or
  exports of the database). Work files go in the scratchpad.
- `firestore.rules` is the full rule set for the shared project, merging the
  JDE-Sched repo's `firestore.rules` and the AutoCoordinator README's rules:
  check both for newer changes and keep their sections, keep the copy in
  README.md identical, and give the owner the whole file to paste into the
  Firebase console after any change.
- Test only against the Firebase emulators (`?emulator=9099,8080` on
  localhost), never the production project. Chromium is at
  `/opt/pw-browsers/chromium`.
- Keep README.md up to date with each change.
