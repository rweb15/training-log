# Training Log (Android)

Rob's workout app: habit/success calendar, lift + cardio logging, progress charts,
switchable training programs, PDF reports, rest timer and gym reminders.

* Web app source: `www/` (plain HTML/JS, no build step). `www/programs.js` holds the program format and the built-in Level I program.
* Android wrapper: Capacitor 8 (`android/`).
* Every push to `main` builds a signed APK in GitHub Actions and publishes it under **Releases**.
* Updates install over the old app (same signing key in `android/keystore/`) so your data is kept.
