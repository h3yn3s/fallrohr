import { XMLParser } from 'fast-xml-parser';
import { getDb, type Subscription, type FeedItem } from '$lib/db';

const parser = new XMLParser({ ignoreAttributes: false });

// Per-feed cache with 5 minute TTL
const feedCache = new Map<string, { items: FeedItem[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchFeed(sub: Subscription): Promise<FeedItem[]> {
	try {
		const res = await fetch(sub.feedUrl);
		const xml = await res.text();
		const data = parser.parse(xml);

		const entries = data?.feed?.entry;
		if (!entries) return [];

		const items = Array.isArray(entries) ? entries : [entries];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return items.map((entry: Record<string, any>) => {
			const videoId = entry['yt:videoId'] ?? '';
			return {
				videoId,
				title: entry.title ?? '',
				channelName: sub.channelName,
				channelId: sub.channelId,
				published: entry.published ?? '',
				thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
				url: entry.link?.['@_href'] ?? `https://www.youtube.com/watch?v=${videoId}`
			};
		});
	} catch (e) {
		// feed fetch failed — return empty
		return [];
	}
}

async function fetchFeedCached(sub: Subscription): Promise<FeedItem[]> {
	const cached = feedCache.get(sub.channelId);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
		return cached.items;
	}

	const items = await fetchFeed(sub);
	feedCache.set(sub.channelId, { items, fetchedAt: Date.now() });
	return items;
}

/** Fetch all feeds, merge into DB, return full persisted list. */
export async function fetchAllFeeds(subs: Subscription[]): Promise<FeedItem[]> {
	const freshItems: FeedItem[] = [];
	for (const sub of subs) {
		const feedItems = await fetchFeedCached(sub);
		freshItems.push(...feedItems);
	}

	// Merge into DB
	const db = await getDb();
	const existing = new Set(db.data.feedItems.map((f) => f.videoId));
	let added = 0;
	for (const item of freshItems) {
		if (!existing.has(item.videoId)) {
			db.data.feedItems.push(item);
			existing.add(item.videoId);
			added++;
		}
	}
	if (added > 0) {
		await db.write();
	}

	// Return all persisted items sorted newest-first
	const all = [...db.data.feedItems].sort(
		(a, b) => new Date(b.published).getTime() - new Date(a.published).getTime()
	);

	return all;
}
