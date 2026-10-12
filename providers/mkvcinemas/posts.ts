import type { Post, ProviderContext } from "../types";
import { throwProviderError } from "../providerErrors";
import { absolute, baseUrl, clean, page } from "./shared";

type Params = { page: number; providerValue: string; signal: AbortSignal; providerContext: ProviderContext };

export function parsePosts(ctx: ProviderContext, html: string, url: string, provider: string): Post[] {
  const $ = ctx.cheerio.load(html);
  const posts: Post[] = [];
  $("article.entry-card, article.post").each((_, element) => {
    const card = $(element);
    const anchor = card.find("h2.entry-title a, h2 a").first();
    const title = clean(anchor.text());
    const link = absolute(anchor.attr("href") || "", url);
    const img = card.find("img").first();
    const image = absolute(img.attr("data-src") || img.attr("data-lazy-src") || img.attr("src") || "", url);
    if (title && link && image && !posts.some(post => post.link === link)) posts.push({ title, link, image, provider });
  });
  if (!posts.length && !/nothing found|no results|no posts|not found/i.test($("main, .content-area").text())) {
    throw new Error("No movie cards found. The website layout may have changed.");
  }
  return posts;
}

export async function getPosts({ filter, page: pageNumber, providerValue, signal, providerContext }: Params & { filter: string }): Promise<Post[]> {
  try {
    const base = await baseUrl(providerContext);
    const path = filter || "/";
    if (!/^\/(?:category\/[a-z0-9-]+\/?)?$/.test(path)) throw new Error("Unsupported catalog filter");
    const currentPage = Math.max(1, Math.floor(pageNumber || 1));
    const url = base + path.replace(/\/$/, "") + (currentPage > 1 ? `/page/${currentPage}/` : "/");
    const response = await page(providerContext, url, signal);
    return parsePosts(providerContext, response.html, response.url, providerValue);
  } catch (error) { throwProviderError("mkvcinemas", "getPosts", error); }
}

export async function getSearchPosts({ searchQuery, page: pageNumber, providerValue, signal, providerContext }: Params & { searchQuery: string }): Promise<Post[]> {
  try {
    if (!searchQuery.trim()) return [];
    const base = await baseUrl(providerContext);
    const currentPage = Math.max(1, Math.floor(pageNumber || 1));
    const url = base + (currentPage > 1 ? `/page/${currentPage}/` : "/") + "?s=" + encodeURIComponent(searchQuery.trim());
    const response = await page(providerContext, url, signal);
    return parsePosts(providerContext, response.html, response.url, providerValue);
  } catch (error) { throwProviderError("mkvcinemas", "getSearchPosts", error); }
}
