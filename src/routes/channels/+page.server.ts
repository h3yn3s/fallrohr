import { getDb } from '$lib/db';

export interface ChannelSummary {
	channelId: string;
	channelName: string;
	downloadedCount: number;
	totalCount: number;
	isSubscribed: boolean;
}

async function loadChannels() {
	const db = await getDb();

	const channelMap = new Map<
		string,
		{
			name: string;
			downloadedCount: number;
			feedOnlyIds: Set<string>;
			subscribed: boolean;
		}
	>();

	function ensure(id: string, name: string) {
		if (!id) return;
		if (!channelMap.has(id)) {
			const sub = db.data.subscriptions.find((s) => s.channelId === id);
			channelMap.set(id, {
				name: name || sub?.channelName || id,
				downloadedCount: 0,
				feedOnlyIds: new Set(),
				subscribed: !!sub
			});
		}
	}

	// Gather from subscriptions
	for (const sub of db.data.subscriptions) {
		ensure(sub.channelId, sub.channelName);
	}

	// Gather from downloaded videos
	for (const v of db.data.videos) {
		if (!v.channelId) continue;
		ensure(v.channelId, v.uploader);
		const ch = channelMap.get(v.channelId)!;
		if (v.local) {
			ch.downloadedCount++;
		}
	}

	// Gather from feed items
	for (const fi of db.data.feedItems) {
		if (!fi.channelId) continue;
		ensure(fi.channelId, fi.channelName);
		const ch = channelMap.get(fi.channelId)!;
		const isDownloaded = db.data.videos.some((v) => v.id === fi.videoId && v.local);
		if (!isDownloaded) {
			ch.feedOnlyIds.add(fi.videoId);
		}
	}

	const channels: ChannelSummary[] = [];
	for (const [channelId, data] of channelMap) {
		channels.push({
			channelId,
			channelName: data.name,
			downloadedCount: data.downloadedCount,
			totalCount: data.downloadedCount + data.feedOnlyIds.size,
			isSubscribed: data.subscribed
		});
	}

	channels.sort((a, b) => a.channelName.localeCompare(b.channelName));

	return channels;
}

export function load() {
	return { channels: loadChannels() };
}
