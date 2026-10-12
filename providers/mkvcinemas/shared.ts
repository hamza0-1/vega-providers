import type { ProviderContext } from "../types";

export const DEFAULT_BASE = "https://mkvcinemas.fo";
export const GROUP_KEY = "mkvcinemas-group=";
export const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export const originOf = (url: string) => url.match(/^https?:\/\/[^/]+/i)?.[0] || "";
export const hostOf = (url: string) => originOf(url).replace(/^https?:\/\//i, "").toLowerCase();
export const withoutFragment = (url: string) => url.split("#")[0];

// Avoid depending on Node or a URL polyfill in the app's JavaScript sandbox.
export function absolute(value: string, base: string): string {
  const raw = value.trim().replace(/&amp;/g, "&");
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw || /^(?:javascript|data|mailto|tel|magnet):/i.test(raw)) return "";
  if (raw.startsWith("//")) return "https:" + raw;
  const origin = originOf(base);
  if (!origin) return "";
  if (raw.startsWith("#")) return withoutFragment(base) + raw;
  if (raw.startsWith("?")) return withoutFragment(base).split("?")[0] + raw;
  const path = raw.startsWith("/") ? raw : base.slice(origin.length).split(/[?#]/)[0].replace(/[^/]*$/, "") + raw;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return origin + (parts[0] === "" ? "" : "/") + parts.join("/");
}

export async function setting<T>(ctx: ProviderContext, key: string, fallback: T): Promise<T> {
  // The template CLI context does not currently provide kvStore.
  return (await ctx.kvStore?.get<T>(key)) ?? fallback;
}

export async function baseUrl(ctx: ProviderContext): Promise<string> {
  const base = (await setting(ctx, "baseUrlOverride", DEFAULT_BASE)).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/?#\s]+(?:\/)?$/i.test(base)) throw new Error("Custom domain must be an HTTP(S) origin, such as https://mkvcinemas.fo");
  return base;
}

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Request cancelled");
    error.name = "AbortError";
    throw error;
  }
}

export function isChallenge(html: string): boolean {
  return /<title[^>]*>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|cf-chl-widget|Checking your browser/i.test(html);
}

export async function requestHeaders(ctx: ProviderContext, url: string, referer?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...ctx.commonHeaders, ...(referer ? { Referer: referer } : {}) };
  const session = await setting<{ cookies: string; userAgent: string; expires: number } | undefined>(ctx, "waf:" + originOf(url), undefined);
  if (session && session.expires > Date.now()) {
    if (session.cookies) headers.Cookie = session.cookies;
    if (session.userAgent) headers["User-Agent"] = session.userAgent;
  }
  return headers;
}

export async function timeout(ctx: ProviderContext): Promise<number> {
  const seconds = Number(await setting(ctx, "requestTimeoutSecs", 20));
  return Math.max(5, Math.min(60, Number.isFinite(seconds) ? seconds : 20)) * 1000;
}

export async function page(ctx: ProviderContext, url: string, signal?: AbortSignal, referer?: string): Promise<{ html: string; url: string }> {
  checkAbort(signal);
  const target = withoutFragment(url);
  let needsWebView = false;
  try {
    const response = await ctx.axios.get(target, {
      headers: await requestHeaders(ctx, target, referer), signal,
      timeout: await timeout(ctx), responseType: "text",
    });
    checkAbort(signal);
    const html = typeof response.data === "string" ? response.data : "";
    if (!isChallenge(html)) {
      if (!html.trim()) throw new Error("The website returned an empty page");
      return { html, url: response.request?.responseURL || response.request?.res?.responseUrl || target };
    }
    needsWebView = true;
  } catch (error) {
    checkAbort(signal);
    const status = (error as any)?.response?.status;
    if (status !== 403 && status !== 503 && status !== 429) throw error;
    const html = String((error as any)?.response?.data || "");
    // Rate limiting is not a browser challenge; don't prompt repeatedly.
    if (status === 429 && !isChallenge(html)) throw new Error("Website rate limit reached. Wait before trying again.");
    needsWebView = true;
  }
  if (needsWebView && await setting(ctx, "useWebView", true) && typeof ctx.openWebView === "function") {
    const result = await ctx.openWebView(target, {
      title: "MKVCinemas verification",
      description: "Complete the website verification to load this page.",
      headers: { ...ctx.commonHeaders, ...(referer ? { Referer: referer } : {}) },
      timeoutMs: 120000,
    });
    checkAbort(signal);
    if (result.data?.trim() && !isChallenge(result.data)) {
      const resolved = result.url || target;
      if (ctx.kvStore && originOf(resolved) === originOf(target)) {
        await ctx.kvStore.set("waf:" + originOf(target), {
          cookies: result.cookies, userAgent: result.userAgent, expires: Date.now() + 30 * 60 * 1000,
        });
      }
      return { html: result.data, url: resolved };
    }
  }
  throw new Error("Website verification is required. Try this provider in Vega with WebView verification enabled; the template CLI cannot solve browser challenges.");
}

export function qualityOf(text: string): string | undefined {
  const value = text.match(/\b(2160|1080|720|480|360)\s*p?\b/i)?.[1];
  return value || (/\b4k\b/i.test(text) ? "2160" : undefined);
}

export function mediaType(url: string, contentType = "", disposition = ""): string | undefined {
  const text = url.split(/[?#]/)[0] + " " + disposition;
  if (/\.m3u8\b/i.test(text) || /mpegurl/i.test(contentType)) return "m3u8";
  if (/\.mpd\b/i.test(text) || /dash\+xml/i.test(contentType)) return "mpd";
  if (/\.mkv\b/i.test(text) || /matroska/i.test(contentType)) return "mkv";
  if (/\.mp4\b/i.test(text) || /video\/mp4/i.test(contentType)) return "mp4";
  if (/\.webm\b/i.test(text) || /video\/webm/i.test(contentType)) return "webm";
  if (/^video\//i.test(contentType)) return "mp4";
  return undefined;
}

export function isCloudHost(url: string): boolean {
  return /^(?:[^.]+\.)*(?:mkvcdn\.com|filesdl\.co)$/.test(hostOf(url));
}

export function isLegacyHost(url: string): boolean {
  return /^(?:[^.]+\.)*hubdrive\.one$/.test(hostOf(url));
}

export function downloadLinks(ctx: ProviderContext, html: string, url: string): { title: string; link: string; quality?: string }[] {
  const $ = ctx.cheerio.load(html);
  const result: { title: string; link: string; quality?: string }[] = [];
  $(".entry-content a[href]").each((_, element) => {
    const title = clean($(element).text());
    const link = absolute($(element).attr("href") || "", url);
    if (!link || !/download|\bplay\b|\bwatch\b/i.test(title) || /tips|telegram|login/i.test(title)) return;
    if (!/^(?:[^.]+\.)*filesdl\.live$/.test(hostOf(link)) && !isCloudHost(link) && !isLegacyHost(link) && !mediaType(link)) return;
    if (!result.some(item => item.link === link)) result.push({ title, link, quality: qualityOf(title) });
    else {
      // Shared quality buttons point to one multi-quality listing: its own headings are authoritative.
      const existing = result.find(item => item.link === link)!;
      if (existing.quality !== qualityOf(title)) {
        existing.title = "All available qualities";
        existing.quality = undefined;
      }
    }
  });
  return result;
}

export function fileGroups(ctx: ProviderContext, html: string, url: string) {
  const $ = ctx.cheerio.load(html);
  const groups: { title: string; quality?: string; servers: { link: string; server: string }[] }[] = [];
  $(".entry-content .download-box").each((index, element) => {
    const box = $(element);
    const heading = clean(box.find("h2,h3").first().text());
    const previous = box.prevAll("h1,h2,h3,h4,h5,h6").first();
    const part = clean(previous.text());
    const size = clean(box.find(".filesize").text());
    const title = clean([part, heading, size].filter(Boolean).join(" · ")) || `Source ${index + 1}`;
    const servers: { link: string; server: string }[] = [];
    box.find(".download-buttons a[href]").each((_, anchor) => {
      const link = absolute($(anchor).attr("href") || "", url);
      if (link && (isCloudHost(link) || mediaType(link)) && !servers.some(item => item.link === link)) {
        // The same MKVCDN URL is labelled HUBCLOUD and GDFLIX on the site.
        servers.push({ link, server: isCloudHost(link) ? (/mkvcdn\.com$/.test(hostOf(link)) ? "MKVCDN" : "VCloud") : clean($(anchor).text()) });
      }
    });
    groups.push({ title, quality: qualityOf(heading), servers });
  });
  return groups;
}
