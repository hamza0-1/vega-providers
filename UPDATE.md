# Update MKVCinemas to 1.0.1

1. Extract this ZIP.
2. Open https://github.com/hamza0-1/vega-providers in your browser.
3. At the repository root, choose Add file -> Upload files.
4. Drag the `providers` folder, `dist` folder, and `manifest.json` from inside this extracted update folder onto the upload page.
5. Commit the changes. The new manifest version must read `1.0.1`.
6. Close the existing MKVCinemas verification window in Vega. Use the extension update/refresh action, or remove and re-add the repository URL if your app version does not expose one. Then restart Vega and select MKVCinemas again.

This update adds the required completion signal for Vega Desktop after real page content loads, removes inconsistent client-hint headers, rejects LiteSpeed/other error pages, and uses a fresh verification-session namespace. It does not bypass website challenges or guarantee that the website will permit Vega's embedded browser.

TypeScript and 18 offline regression tests passed. On-device validation remains necessary. This version was checked against the current Vega Desktop verification implementation; the installed app version may differ.

If the updated provider still shows 403, report that it persists on 1.0.1 and include your Vega version. A working regular browser session does not mean Vega shares its cookies or request behavior.
