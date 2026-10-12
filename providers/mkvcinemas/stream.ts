import type { ProviderContext, Stream } from "../types";
import { throwProviderError } from "../providerErrors";
import {
  absolute, checkAbort, clean, fileGroups, GROUP_KEY, hostOf, isCloudHost, isLegacyHost,
  mediaType, page, qualityOf, requestHeaders, setting, timeout, withoutFragment,
} from "./shared";

type Candidate = { link: string; server: string; quality?: string; referer: string };

function header(headers: any, name: string): string {
  return String(headers?.get?.(name) || headers?.[name] || headers?.[name.toLowerCase()] || "");
}

// Follow redirects with HEAD so resolving a source never downloads the video into memory.
async function resolveMedia(candidate: Candidate, ctx: ProviderContext, signal?: AbortSignal): Promise<Stream> {
  let url = candidate.link;
  let referer = candidate.referer;
  const visited = new Set<string>();
  for (let hop = 0; hop < 8; hop++) {
    checkAbort(signal);
    if (visited.has(url)) throw new Error("Download redirect loop");
    visited.add(url);
    const headers = await requestHeaders(ctx, url, referer);
    const response = await ctx.axios.head(url, {
      headers, signal, timeout: await timeout(ctx), maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400,
    });
    checkAbort(signal);
    const location = header(response.headers, "location");
    if (location && response.status >= 300) {
      referer = url;
      url = absolute(location, url);
      if (!url) throw new Error("Invalid download redirect");
      continue;
    }
    // Some injected clients automatically follow redirects despite maxRedirects.
    const finalUrl = response.request?.responseURL || response.request?.res?.responseUrl || url;
    const contentType = header(response.headers, "content-type");
    if (/text\/html|application\/(?:json|xhtml)/i.test(contentType)) throw new Error("Download route returned a webpage instead of a video");
    const type = mediaType(finalUrl, contentType, header(response.headers, "content-disposition"));
    if (!type) throw new Error("Download route did not identify a supported video file");
    // Build headers for the FINAL origin; never send challenge cookies to another host.
    return { server: candidate.server, link: finalUrl, type, quality: candidate.quality,
      headers: await requestHeaders(ctx, finalUrl, referer) };
  }
  throw new Error("Too many download redirects");
}

async function cloudCandidates(candidate: Candidate, ctx: ProviderContext, signal?: AbortSignal): Promise<Candidate[]> {
  if (isLegacyHost(candidate.link)) {
    const response = await page(ctx, candidate.link, signal, candidate.referer);
    const $ = ctx.cheerio.load(response.html);
    const links: Candidate[] = [];
    $("a[href]").each((_, element) => {
      const link = absolute($(element).attr("href") || "", response.url);
      if ((isCloudHost(link) || mediaType(link)) && !links.some(item => item.link === link)) {
        links.push({ link, server: "HubDrive", referer: response.url, quality: candidate.quality || qualityOf($("h1, title").first().text()) });
      }
    });
    if (!links.length) throw new Error("This legacy HubDrive page has no supported media links. Its origin server may be unavailable.");
    const expanded: Candidate[] = [];
    for (const item of links) expanded.push(...await cloudCandidates(item, ctx, signal));
    return expanded;
  }
  if (!isCloudHost(candidate.link)) return [candidate];
  const response = await page(ctx, candidate.link, signal, candidate.referer);
  const $ = ctx.cheerio.load(response.html);
  const result: Candidate[] = [];
  const quality = candidate.quality || qualityOf($("h1, title").first().text());
  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const label = clean(anchor.text());
    if (/telegram|login|gofile/i.test(label)) return;
    const link = absolute(anchor.attr("href") || "", response.url);
    // Only observed download controls; do not follow ads or arbitrary scripts.
    if (!link || (!/\/l\.php\?/i.test(link) && !mediaType(link))) return;
    if (!/download|cloud direct|pixeldrain/i.test(label)) return;
    if (result.some(item => item.link === link)) return;
    result.push({ link, quality, referer: response.url, server: `${candidate.server} · ${label || "Direct"}` });
  });
  if (!result.length) throw new Error("No supported direct download controls found on " + hostOf(response.url));
  return result;
}

export async function getStream({ link, type, signal, providerContext, isDownload }: {
  link: string; type: string; signal?: AbortSignal; providerContext: ProviderContext; isDownload?: boolean;
}): Promise<Stream[]> {
  try {
    checkAbort(signal);
    if (!/^https?:\/\//i.test(link)) throw new Error("Expected an HTTP(S) source link");
    let candidates: Candidate[];
    const sourceUrl = withoutFragment(link);
    if (mediaType(sourceUrl) || isCloudHost(sourceUrl) || isLegacyHost(sourceUrl)) {
      candidates = [{ link: sourceUrl, server: hostOf(sourceUrl), referer: sourceUrl }];
    } else if (/^(?:[^.]+\.)*filesdl\.live$/.test(hostOf(sourceUrl))) {
      const response = await page(providerContext, sourceUrl, signal);
      const groups = fileGroups(providerContext, response.html, response.url);
      const fragment = link.split("#")[1] || "";
      const selected = fragment.startsWith(GROUP_KEY) ? fragment.slice(GROUP_KEY.length) : undefined;
      if (selected !== undefined && !/^\d+$/.test(selected)) throw new Error("Invalid episode group selection");
      if (selected !== undefined && !groups[Number(selected)]) throw new Error("Selected episode group is no longer available");
      if (type === "series" && selected === undefined && groups.length > 1) throw new Error("Select an episode or part before playing this series");
      candidates = [];
      groups.forEach((group, index) => {
        if (selected !== undefined && index !== Number(selected)) return;
        group.servers.forEach(server => candidates.push({ ...server, quality: group.quality, referer: response.url }));
      });
    } else {
      throw new Error("Unsupported source host: " + hostOf(sourceUrl));
    }
    if (!candidates.length) throw new Error("No supported sources found");

    const streams: Stream[] = [];
    const failures: string[] = [];
    const seenRoutes = new Set<string>();
    // Run sequentially: WebView challenges must not open competing dialogs.
    for (const candidate of candidates) {
      checkAbort(signal);
      try {
        const routes = await cloudCandidates(candidate, providerContext, signal);
        for (const route of routes) {
          if (seenRoutes.has(route.link)) continue;
          seenRoutes.add(route.link);
          try {
            const stream = await resolveMedia(route, providerContext, signal);
            if (!streams.some(existing => existing.link === stream.link)) streams.push(stream);
          } catch (error) {
            checkAbort(signal);
            failures.push(`${route.server}: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        checkAbort(signal);
        failures.push(`${candidate.server}: ${(error as Error).message}`);
      }
    }
    if (!streams.length) throw new Error("No playable sources resolved. " + failures.slice(0, 4).join(" | ") + " Some routes may require website verification or may not support HEAD requests.");
    const preferred = await setting(providerContext, "preferredQuality", "auto");
    streams.sort((a, b) => {
      const match = Number(b.quality === preferred) - Number(a.quality === preferred);
      if (match) return match;
      const score = (stream: Stream) => isDownload
        ? Number(stream.type === "mp4" || stream.type === "mkv" || stream.type === "webm")
        : Number(stream.type === "m3u8" || stream.type === "mpd");
      return score(b) - score(a) || Number(b.quality || 0) - Number(a.quality || 0);
    });
    return streams;
  } catch (error) { throwProviderError("mkvcinemas", "getStream", error); }
}
