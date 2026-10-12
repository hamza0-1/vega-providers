# MKVCinemas provider for Vega

Version: 1.0.0. Built from `vega-org/providers-template` commit `4e53b30194f8e5ada1f23d99c8db57291fadf266`.
Default website: https://mkvcinemas.fo/

## What is included

- Category browsing, language filters, paginated lists, and paginated search.
- Movie/series metadata, posters, cast, language/year tags, and available source groups.
- Deferred episode/part lists from Filesdl. Combined episode files retain their real part labels.
- Filesdl quality/server discovery, MKVCDN and Filesdl/VCloud download-control extraction.
- HEAD-based media resolution with bounded redirects, source deduplication, and alternate-host fallback.
- Optional Vega WebView verification, cookies scoped to each challenged origin, and request cancellation.
- Website-domain override, preferred quality, verification toggle, and timeout settings.
- All six compiled modules in `dist/mkvcinemas/`, source, manifest, template tools, and regression tests.

## Validation status and limits

TypeScript checking and 16 offline regression tests passed. The compiled modules also loaded in a JavaScript VM without Node's `require` or `module` globals.

Live browser inspection confirmed the homepage, search results, movie details, series details, Filesdl quality groups, combined series parts, and MKVCDN/VCloud download controls. The fixtures in the regression tests are reduced versions of these observed structures with synthetic tokens/media URLs.

**Final video playback and downloads have not been verified inside Vega.** Direct HTTP/CLI requests encounter Cloudflare. The stock template CLI context has no working `openWebView` or `kvStore`; its live integration test stopped at browsing with a verification-required error. Successful offline tests do not establish live playback.

The stream resolver requires working HEAD responses/redirects identifying a media file. A host that rejects HEAD, requires another browser interaction, or returns an HTML interstitial will fail with an explicit error rather than be returned as a fake video source. App client handling of HEAD and redirects still needs an on-device check.

Older titles may link to `hubdrive.one`; the inspected host returned Cloudflare **522 (origin connection timeout)**. Those links remain in metadata. The legacy handler can follow supported media/cloud links if the host recovers, but its extraction could not be verified live. Unknown host layouts, account-only GDFLIX routes, Telegram files, and GoFile page/API resolution are not implemented.

## Install as a new provider repository

1. Extract the ZIP. The `mkvcinemas-provider` folder is the repository root.
2. Create or use your GitHub repository, preferably named `vega-providers`.
3. Upload/commit the repository contents, including **`manifest.json` and `dist/mkvcinemas/`**. Do not upload the ZIP as the installation asset.
4. In Vega's provider/extension settings, add your GitHub username for a repository named `vega-providers`, or enter the full repository URL.
5. Select MKVCinemas. Leave Website verification enabled and complete the site's verification when Vega opens its WebView.
6. Check a movie and a series part on your device before relying on playback/downloads.

No GitHub repository has been created or published by this task.

## Add to an existing template repository

Copy `providers/mkvcinemas/` into your existing `providers/` directory. Keep the shared `providers/types.ts` and `providers/providerErrors.ts` from this template version. Merge this entry into your existing manifest instead of replacing other entries:

```json
{
  "display_name": "MKVCinemas",
  "value": "mkvcinemas",
  "version": "1.0.0",
  "icon": "",
  "type": "global",
  "hasSettings": true,
  "disabled": false
}
```

Then build and commit `dist/mkvcinemas/` along with the source and manifest. Increment the manifest version after provider updates.

## Develop and test

Use a current Node.js runtime supporting the template's dependencies and Node's built-in test runner.

```sh
npm install
npm run build
npx tsc --noEmit
node tests/mkvcinemas.test.js
```

`npm run test:mkvcinemas` rebuilds and runs the offline regression suite.

The original template CLI tools remain available:

```sh
npm test -- mkvcinemas
npm run test:provider -- mkvcinemas getPosts --rebuild
npm run auto
```

Live CLI commands can fail on Cloudflare even when the page works in a browser. The template integration runner also reports some failures without a nonzero exit status; read its result summary. The template build script logs per-module failures, so verify all six provider outputs exist and use the TypeScript/regression checks.

For local app testing, `npm run auto` serves files on port 3001. In your Vega app's `src/lib/services/ExtensionManager.ts`, use the template-documented configuration:

```ts
private testMode = true;
private baseUrlTestMode = "http://YOUR_LOCAL_IP:3001";
```

Use the printed Mobile Test URL and put the phone/computer on the same network. These app source changes are made in your Vega app project, not this provider repository. See `TEMPLATE-README.md` for the original template instructions.

## Implementation notes

`shared.ts` is bundled into each entry module; it needs no separate app entry. Provider functions use only the injected context and local helpers. The Node dependencies belong to the development/test tooling.

Series episode links encode a Filesdl group index in `#mkvcinemas-group=N`. `getStream` fetches that listing and selects only the requested group so playing one part cannot resolve a different part. Source layouts changing between selection and playback may require reopening the title.

MKVCinemas sometimes assigns the same Filesdl URL to several advertised qualities. The provider deduplicates those links and trusts the actual Filesdl group headings; it does not invent a 2160p source just because a button says 2160p.

Expired media URLs are regenerated by resolving the cloud page on every stream request. Verification cookies expire locally after 30 minutes and are sent only to the origin they belong to. The preferred-quality setting orders available sources without removing alternatives.
