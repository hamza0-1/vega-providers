import type { EpisodeLink, ProviderContext } from "../types";
import { throwProviderError } from "../providerErrors";
import { fileGroups, GROUP_KEY, page, withoutFragment } from "./shared";

export async function getEpisodes({ url, providerContext }: { url: string; providerContext: ProviderContext }): Promise<EpisodeLink[]> {
  try {
    const response = await page(providerContext, url);
    const groups = fileGroups(providerContext, response.html, response.url);
    if (!groups.some(group => group.servers.length)) throw new Error("No episode or part groups found on this Filesdl page.");
    // Some series are multi-episode files. Preserve the site's 'Part (Ep.01-05)' label.
    const episodes: EpisodeLink[] = [];
    groups.forEach((group, index) => {
      if (group.servers.length) episodes.push({
        title: group.title,
        link: withoutFragment(response.url) + "#" + GROUP_KEY + index,
        description: "Play the episode or combined part exactly as supplied by the website.",
      });
    });
    return episodes;
  } catch (error) { throwProviderError("mkvcinemas", "getEpisodes", error); }
}
