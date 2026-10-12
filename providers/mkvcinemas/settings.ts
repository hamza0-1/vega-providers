import type { ProviderContext, SettingsField } from "../types";

export async function getSettingsSchema({ providerContext }: { providerContext: ProviderContext }): Promise<SettingsField[]> {
  return [
    { key: "baseUrlOverride", label: "Website domain", type: "text", defaultValue: "https://mkvcinemas.fo", placeholder: "https://mkvcinemas.fo", description: "Update this if MKVCinemas changes its domain." },
    { key: "useWebView", label: "Website verification", type: "toggle", defaultValue: true, description: "Open Vega's browser when the website requires verification." },
    { key: "preferredQuality", label: "Preferred quality", type: "select", defaultValue: "auto", options: [
      { label: "Best available", value: "auto" }, { label: "2160p", value: "2160" }, { label: "1080p", value: "1080" }, { label: "720p", value: "720" }, { label: "480p", value: "480" },
    ], description: "Put matching sources first while keeping alternatives available." },
    { key: "requestTimeoutSecs", label: "Request timeout (seconds)", type: "number", defaultValue: 20, min: 5, max: 60 },
  ];
}
