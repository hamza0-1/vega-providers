// Reduced fixtures preserve the DOM structure observed on the live site on 2026-10-13.
// Host tokens and media URLs are synthetic; these tests do not claim live playback.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { getPosts, getSearchPosts } = require('../dist/mkvcinemas/posts');
const { getMeta } = require('../dist/mkvcinemas/meta');
const { getEpisodes } = require('../dist/mkvcinemas/episodes');
const { getStream } = require('../dist/mkvcinemas/stream');
const { getSettingsSchema } = require('../dist/mkvcinemas/settings');

const listing = `<main><article class="entry-card"><a><img src="https://images.example/poster.webp"></a><h2 class="entry-title"><a href="/ballerina">Ballerina 2023 Full Movie HD</a></h2></article><article class="entry-card"><img data-src="https://images.example/series.webp" src="data:image/gif;base64,placeholder"><h2 class="entry-title"><a href="/vincenzo">Vincenzo S01 Web Series</a></h2></article></main>`;
const movie = `<article><h1 class="entry-title">Ballerina 2023 Hindi + English Hollywood Full Movie HD</h1><div class="entry-content"><div class="post"><p>Ballerina is a Hindi dubbed movie.</p><img src="https://images.example/movie.webp"><h3>Series Info</h3><ul class="series-info"><li><strong>Release Year:</strong> 2023</li><li><strong>Language:</strong> Hindi + English</li><li><strong>Starcast:</strong> Jeon Jong-seo, Kim Ji-hoon</li><li><strong>IMDB Rating:</strong> Na</li></ul><h2>Download Links</h2><a href="https://filesdl.live/view/movie">480P DOWNLOAD Now</a><a href="https://filesdl.live/view/movie">720P DOWNLOAD Now</a><a href="https://filesdl.live/view/movie">1080P DOWNLOAD Now</a><a href="https://filesdl.live/view/movie">2160P DOWNLOAD Now</a></div></div></article>`;
const series = movie.replace('Ballerina 2023 Hindi + English Hollywood Full Movie HD', 'Vincenzo S01 (2021) Hindi + English Full Web Series HD').replace(/https:\/\/filesdl.live\/view\/movie/g, 'https://filesdl.live/view/series');
function box(quality, cloud, heading = '') {
  return `${heading ? `<h4>${heading}</h4>` : ''}<div class="download-box q${quality}"><h2>${quality}P DOWNLOAD</h2><div class="filesize">1.3GB</div><div class="download-buttons"><a class="btn-hubcloud" href="https://mkvcdn.com/cloud/${cloud}">HUBCLOUD DOWNLOAD</a><a class="btn-gdflix" href="https://mkvcdn.com/cloud/${cloud}">GDFLIX DOWNLOAD</a><a class="btn-vcloud" href="https://new1.filesdl.co/cloud/${cloud}">VCLOUD DOWNLOAD</a></div></div>`;
}
const movieFiles = `<div class="entry-content">${box('480', 'low')}${box('1080', 'high')}</div>`;
const seriesFiles = `<div class="entry-content">${box('480', 'part1', 'Part-01 (Ep.01-05)')}${box('480', 'part2', 'Part-02 (Ep.06-10)')}</div>`;
const cloud = id => `<title>${id} 480p ESub.mkv</title><a class="primary-download dl-trigger" href="/l.php?file=${id}&amp;token=fresh">Download Here</a><a href="/l.php?file=${id}&amp;token=fresh">Download - HubCloud</a><a href="/l.php?file=${id}&amp;gofile=1">Download - GoFile.io</a><a href="/l.php?file=${id}&amp;telegram=1">Telegram File</a><a href="https://ads.example/">Advertisement</a>`;

function context(options = {}) {
  const calls = [], storage = new Map(Object.entries(options.settings || {}));
  const ctx = { cheerio, commonHeaders: { 'User-Agent': 'test-agent' },
    kvStore: { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value), delete: async key => storage.delete(key), keys: async () => [...storage.keys()], clear: async () => storage.clear() },
    axios: {
      get: async (url, config) => {
        calls.push({ method: 'GET', url, config });
        if (options.get) return options.get(url, config);
        let html;
        if (url.includes('/cloud/')) html = cloud(url.split('/').pop());
        else if (url === 'https://filesdl.live/view/movie') html = movieFiles;
        else if (url === 'https://filesdl.live/view/series') html = seriesFiles;
        else if (url.endsWith('/ballerina')) html = movie;
        else if (url.endsWith('/vincenzo')) html = series;
        else html = listing;
        return { data: html, request: { responseURL: url } };
      },
      head: async (url, config) => {
        calls.push({ method: 'HEAD', url, config });
        if (options.head) return options.head(url, config);
        if (url.includes('/l.php?')) {
          const id = url.match(/file=([^&]+)/)[1];
          return { status: 302, headers: { location: `https://media.example/${id}.mkv` } };
        }
        return { status: 200, headers: { 'content-type': 'video/x-matroska' } };
      },
    },
  };
  return { ctx, calls, storage };
}
const params = ctx => ({ page: 1, providerValue: 'mkvcinemas', signal: new AbortController().signal, providerContext: ctx });

test('home/category pagination and lazy posters use the configured origin', async () => {
  const { ctx, calls } = context({ settings: { baseUrlOverride: 'https://mirror.example/' } });
  const posts = await getPosts({ ...params(ctx), filter: '/category/hollywood-movies/', page: 2 });
  assert.equal(calls[0].url, 'https://mirror.example/category/hollywood-movies/page/2/');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].link, 'https://mirror.example/ballerina');
  assert.equal(posts[1].image, 'https://images.example/series.webp');
  assert.equal(posts[0].provider, 'mkvcinemas');
});
test('search encodes input and preserves pagination; empty searches make no request', async () => {
  const { ctx, calls } = context();
  await getSearchPosts({ ...params(ctx), searchQuery: 'Hindi & English', page: 2 });
  assert.equal(calls[0].url, 'https://mkvcinemas.fo/page/2/?s=Hindi%20%26%20English');
  assert.deepEqual(await getSearchPosts({ ...params(ctx), searchQuery: ' ' }), []);
  assert.equal(calls.length, 1);
});
test('a genuine empty search is allowed but broken layouts fail visibly', async () => {
  const empty = context({ get: async () => ({ data: '<main>Nothing Found</main>' }) });
  assert.deepEqual(await getSearchPosts({ ...params(empty.ctx), searchQuery: 'missing' }), []);
  const broken = context({ get: async () => ({ data: '<main>New website</main>' }) });
  await assert.rejects(getPosts({ ...params(broken.ctx), filter: '/' }), /layout may have changed/);
});
test('movie metadata is not misclassified by the Series Info heading; repeated URLs deduplicate', async () => {
  const { ctx } = context();
  const meta = await getMeta({ link: 'https://mkvcinemas.fo/ballerina', providerContext: ctx });
  assert.equal(meta.type, 'movie');
  assert.equal(meta.linkList.length, 1);
  assert.equal(meta.linkList[0].quality, undefined);
  assert.equal(meta.linkList[0].title, 'All available qualities');
  assert.equal(meta.imdbId, '');
  assert.equal(meta.rating, undefined);
  assert.deepEqual(meta.cast, ['Jeon Jong-seo', 'Kim Ji-hoon']);
});
test('series metadata uses deferred groups and preserves combined episode parts', async () => {
  const { ctx } = context();
  const meta = await getMeta({ link: 'https://mkvcinemas.fo/vincenzo', providerContext: ctx });
  assert.equal(meta.type, 'series');
  assert.equal(meta.linkList[0].directLinks, undefined);
  const episodes = await getEpisodes({ url: meta.linkList[0].episodesLink, providerContext: ctx });
  assert.equal(episodes.length, 2);
  assert.match(episodes[0].title, /Part-01 \(Ep\.01-05\)/);
  assert.equal(episodes[1].link, 'https://filesdl.live/view/series#mkvcinemas-group=1');
});
test('selected series group resolves only that part and deduplicates identical hosts/routes', async () => {
  const { ctx, calls } = context();
  const streams = await getStream({ link: 'https://filesdl.live/view/series#mkvcinemas-group=1', type: 'series', providerContext: ctx });
  assert.equal(streams.length, 1);
  assert.equal(streams[0].link, 'https://media.example/part2.mkv');
  assert.equal(streams[0].type, 'mkv');
  assert.equal(streams[0].quality, '480');
  assert.ok(!calls.some(call => /part1|gofile|telegram|ads\.example/.test(call.url)));
  assert.equal(calls.filter(call => call.url === 'https://mkvcdn.com/cloud/part2').length, 1);
});
test('movie resolver uses Filesdl qualities and returns all resolved qualities', async () => {
  const { ctx } = context({ settings: { preferredQuality: '480' } });
  const streams = await getStream({ link: 'https://filesdl.live/view/movie', type: 'movie', providerContext: ctx, isDownload: true });
  assert.equal(streams.length, 2);
  assert.deepEqual(streams.map(stream => stream.quality), ['480', '1080']);
});
test('bad series group and unselected multi-part series never play a different part', async () => {
  const { ctx } = context();
  await assert.rejects(getStream({ link: 'https://filesdl.live/view/series#mkvcinemas-group=9', type: 'series', providerContext: ctx }), /no longer available/);
  await assert.rejects(getStream({ link: 'https://filesdl.live/view/series', type: 'series', providerContext: ctx }), /Select an episode/);
});
test('Cloudflare invokes WebView and saves cookies scoped to the challenged origin', async () => {
  const { ctx, storage } = context({ get: async () => { const error = new Error('403'); error.response = { status: 403, data: '<title>Just a moment...</title>' }; throw error; } });
  let opened = 0;
  ctx.openWebView = async url => { opened++; return { data: listing, cookies: 'cf_clearance=test', userAgent: 'webview-agent', url }; };
  const posts = await getPosts({ ...params(ctx), filter: '/' });
  assert.equal(posts.length, 2);
  assert.equal(opened, 1);
  assert.equal(storage.get('waf:https://mkvcinemas.fo').cookies, 'cf_clearance=test');
});
test('unavailable or disabled WebView returns an actionable error; ordinary rate limits do not open it', async () => {
  const blocked = context({ settings: { useWebView: false }, get: async () => ({ data: '<title>Just a moment...</title>' }) });
  await assert.rejects(getPosts({ ...params(blocked.ctx), filter: '/' }), /verification is required/);
  const limited = context({ get: async () => { const error = new Error('429'); error.response = { status: 429, data: 'slow down' }; throw error; } });
  limited.ctx.openWebView = () => { throw new Error('Unexpected WebView'); };
  await assert.rejects(getPosts({ ...params(limited.ctx), filter: '/' }), /rate limit reached/);
});
test('HEAD redirects do not leak host cookies to the media origin', async () => {
  const { ctx, calls } = context({ settings: { 'waf:https://mkvcdn.com': { cookies: 'secret=host', userAgent: 'webview-agent', expires: Date.now() + 60000 } } });
  const streams = await getStream({ link: 'https://mkvcdn.com/cloud/part1', type: 'movie', providerContext: ctx });
  assert.equal(calls.find(call => call.method === 'HEAD' && /mkvcdn/.test(call.url)).config.headers.Cookie, 'secret=host');
  assert.equal(calls.find(call => call.method === 'HEAD' && /media\.example/.test(call.url)).config.headers.Cookie, undefined);
  assert.equal(streams[0].headers.Cookie, undefined);
});
test('HTML download routes and redirect loops are not returned as playable sources', async () => {
  const html = context({ head: async () => ({ status: 200, headers: { 'content-type': 'text/html' } }) });
  await assert.rejects(getStream({ link: 'https://mkvcdn.com/cloud/test', type: 'movie', providerContext: html.ctx }), /webpage instead of a video/);
  const loop = context({ head: async url => ({ status: 302, headers: { location: url } }) });
  await assert.rejects(getStream({ link: 'https://mkvcdn.com/cloud/test', type: 'movie', providerContext: loop.ctx }), /redirect loop/);
});
test('one failing host does not discard another working host', async () => {
  const { ctx } = context({ head: async url => {
    if (/mkvcdn/.test(url)) throw new Error('Host unavailable');
    if (/l\.php/.test(url)) return { status: 302, headers: { location: 'https://media.example/fallback.mkv' } };
    return { status: 200, headers: { 'content-type': 'video/x-matroska' } };
  } });
  const streams = await getStream({ link: 'https://filesdl.live/view/movie', type: 'movie', providerContext: ctx });
  assert.equal(streams[0].link, 'https://media.example/fallback.mkv');
});
test('cancellation prevents HTTP requests and settings match implemented options', async () => {
  const { ctx, calls } = context();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(getPosts({ ...params(ctx), signal: controller.signal, filter: '/' }), /cancelled/);
  assert.equal(calls.length, 0);
  const settings = await getSettingsSchema({ providerContext: ctx });
  assert.deepEqual(settings.map(field => field.key), ['baseUrlOverride', 'useWebView', 'preferredQuality', 'requestTimeoutSecs']);
});

test('older HubDrive metadata preserves links and uses the poster rather than screenshots', async () => {
  const older = movie.replace('<article>', '<meta property="og:image" content="https://images.example/real-poster.webp"><article>').replace(/https:\/\/filesdl.live\/view\/movie/g, 'https://hubdrive.one/file/3007');
  const { ctx } = context({ get: async () => ({ data: older }) });
  const meta = await getMeta({ link: 'https://mkvcinemas.fo/older', providerContext: ctx });
  assert.equal(meta.image, 'https://images.example/real-poster.webp');
  assert.equal(meta.linkList[0].directLinks[0].link, 'https://hubdrive.one/file/3007');
});

test('all six built modules load without require, module, or Node built-ins', async () => {
  for (const name of ['catalog', 'posts', 'meta', 'episodes', 'stream', 'settings']) {
    const sandbox = { exports: {}, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'dist', 'mkvcinemas', name + '.js'), 'utf8'), sandbox);
    assert.ok(Object.keys(sandbox.exports).length > 0, name);
  }
});
