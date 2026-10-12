import type { Info, ProviderContext } from "../types";
import { throwProviderError } from "../providerErrors";
import { absolute, baseUrl, clean, downloadLinks, page } from "./shared";

export async function getMeta({ link, providerContext }: { link: string; providerContext: ProviderContext }): Promise<Info> {
  try {
    const response = await page(providerContext, absolute(link, (await baseUrl(providerContext)) + "/"));
    const $ = providerContext.cheerio.load(response.html);
    const content = $(".entry-content").first();
    const title = clean($("h1.entry-title, h1").first().text());
    if (!title || !content.length) throw new Error("Movie details were not found. The website layout may have changed.");
    // Movies also have a heading called 'Series Info'; classify from title and categories instead.
    const categories = clean($(".entry-meta a[href*='/category/'], .breadcrumb a[href*='/category/']").text());
    const type = /web[ -]?series|\bS\d{1,2}\b|\bseason\b|tv[ -]?show|k-drama/i.test(title + " " + categories) ? "series" : "movie";
    const image = absolute($("meta[property='og:image']").attr("content") || content.find("img:not(.emoji):not([alt*='Screenshot'])").first().attr("src") || "", response.url);
    const details: Record<string, string> = {};
    content.find(".series-info li").each((_, element) => {
      const text = clean($(element).text());
      const colon = text.indexOf(":");
      if (colon >= 0) details[text.slice(0, colon).toLowerCase()] = text.slice(colon + 1).trim();
    });
    const sources = downloadLinks(providerContext, response.html, response.url);
    if (!sources.length) throw new Error("No supported download links found for this title.");
    const season = title.match(/\bS(\d{1,2})\b/i)?.[1];
    const linkList: Info["linkList"] = sources.map(source => type === "series" ? {
      title: `${season ? "Season " + Number(season) + " · " : ""}${source.title}`,
      quality: source.quality, episodesLink: source.link,
    } : {
      title: source.title, quality: source.quality,
      directLinks: [{ title: source.title, link: source.link, type: "movie" }],
    });
    const imdbId = content.find("a[href*='imdb.com/title/']").attr("href")?.match(/tt\d+/)?.[0] || "";
    return {
      title, image, poster: image, synopsis: clean(content.find("p").first().text()),
      imdbId, type, linkList, webUrl: response.url,
      cast: details.starcast ? details.starcast.split(",").map(clean).filter(Boolean) : [],
      ...(details["imdb rating"] && !/^(?:na|n\/a)$/i.test(details["imdb rating"]) ? { rating: details["imdb rating"] } : {}),
      tags: [details.language, details.quality, details["release year"]].filter(Boolean),
    };
  } catch (error) { throwProviderError("mkvcinemas", "getMeta", error); }
}
