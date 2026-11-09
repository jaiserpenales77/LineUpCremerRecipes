# LineUp · Cremer Recipes

Static web app (no build step) published to GitHub Pages from branch
`claude/practical-pascal-31ea52`; the whole repository is published, and it is
public. Recipes live in Firestore (project `jde-schedule-database`, shared with
Packaging Lead Hub and JDE Sched); see README.md.

- Never commit recipe data (a `cremer-recipes.html` with recipes built in, or
  exports of the database). Work files go in the scratchpad.
- `firestore.rules` is the full rule set for the shared project: keep the JDE
  Sched and Packaging Lead Hub sections as they are, keep the copy in
  README.md identical, and give the owner the whole file to paste into the
  Firebase console after any change.
- Test only against the Firebase emulators (`?emulator=9099,8080` on
  localhost), never the production database. Chromium is at
  `/opt/pw-browsers/chromium`.
- Keep README.md up to date with each change.
