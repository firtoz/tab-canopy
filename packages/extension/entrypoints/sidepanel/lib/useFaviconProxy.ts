import { useEffect, useState } from "react";
import { useIdbTransportAdapter } from "./db/useIdbTransportAdapter";

/**
 * Cache for favicon data URLs to avoid repeated fetches
 */
const faviconCache = new Map<string, string | null>();

/**
 * Hook to fetch favicons through the background script proxy
 * This avoids CORS and CSP issues by letting the background script fetch the image
 */
export function useFaviconProxy(url: string | null | undefined): {
	dataUrl: string | null;
	isLoading: boolean;
	error: string | null;
} {
	const [dataUrl, setDataUrl] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { adapter } = useIdbTransportAdapter();

	useEffect(() => {
		// Skip if no adapter or URL or if it's an internal browser URL
		if (
			!adapter ||
			!url ||
			url.startsWith("chrome://") ||
			url.startsWith("chrome-extension://") ||
			url.startsWith("about:")
		) {
			setDataUrl(null);
			setIsLoading(false);
			setError(null);
			return;
		}

		// Check cache first
		if (faviconCache.has(url)) {
			setDataUrl(faviconCache.get(url) ?? null);
			setIsLoading(false);
			setError(null);
			return;
		}

		// Fetch through background script
		setIsLoading(true);
		setError(null);

		const requestId = `favicon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

		adapter
			.fetchFavicon(url, requestId)
			.then((response) => {
				setIsLoading(false);
				if (response.success) {
					setDataUrl(response.result);
					faviconCache.set(url, response.result);
				} else {
					setError(response.error);
					faviconCache.set(url, null);
				}
			})
			.catch((err) => {
				setIsLoading(false);
				setError(err.message || "Failed to fetch favicon");
				faviconCache.set(url, null);
			});
	}, [url, adapter]);

	return { dataUrl, isLoading, error };
}

/**
 * Clear the favicon cache (useful for testing or when favicons change)
 */
export function clearFaviconCache() {
	faviconCache.clear();
}
