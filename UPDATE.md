# MKVCinemas 1.0.2: Vega Desktop 2.0.6 compatibility

Extract this ZIP. At the root of https://github.com/hamza0-1/vega-providers choose Add file -> Upload files and drag in `providers`, `dist`, and `manifest.json`. Commit the changes. Refresh/reinstall the extension in Vega so it loads provider version 1.0.2.

Version 1.0.1 used the current development branch's WebView completion API. The released Vega Desktop 2.0.6 does not implement injectedJavaScript. It auto-completes verification only when the cookie specified by waitForCookie appears. Version 1.0.2 adds the supported cf_clearance cookie completion path while retaining the script for newer app builds.

This corrects completion compatibility. It does not fix or bypass a website's LiteSpeed 403 denial. If 403 persists, the embedded browser still cannot access the site, and there is no verified provider-only fix at this point. A working session in a regular browser does not automatically transfer to Vega. No final media playback has been verified.

TypeScript and all 18 offline regression tests pass, including an assertion that the supported 2.0.6 completion option is provided. Actual website verification still requires a test in the user's app.
