import { getDb } from '$lib/db';
import { fetchAllFeeds } from '$lib/server/feeds';

function buildChannelData(channelId: string) {
	const db = getDb();

	// getDb() returns a cached singleton after first await, so we can
	// safely use the synchronous result in subsequent calls.
	return db.then((db) => {
		const sub = db.data.subscriptions.find((s) => s.channelId === channelId);
		const videos = db.data.videos.filter((v) => v.channelId === channelId);
		const downloadedIds = new Set(videos.filter((v) => v.local).map((v) => v.id));

		const feedOnly = db.data.feedItems
			.filter((fi) => fi.channelId === channelId && !downloadedIds.has(fi.videoId))
			.map((fi) => ({
				videoId: fi.videoId,
				title: fi.title,
				channelName: fi.channelName,
				thumbnail: fi.thumbnail,
				url: fi.url,
				published: fi.published,
				downloaded: false as const,
				duration: 0,
				watchPercent: 0,
				uploadDate: '',
				uploader: fi.channelName
			}));

		const downloadedVideos = videos
			.filter((v) => v.local)
			.map((v) => ({
				videoId: v.id,
				title: v.title,
				channelName: v.uploader,
				thumbnail: `/api/media/${v.id}.jpg`,
				url: v.webpage_url,
				published: v.upload_date || v.downloaded_at,
				downloaded: true as const,
				duration: v.duration,
				watchPercent: v.duration ? (v.watch_progress / v.duration) * 100 : 0,
				uploadDate: v.upload_date,
				uploader: v.uploader
			}));

		const allItems = [...downloadedVideos, ...feedOnly].sort(
			(a, b) => new Date(b.published).getTime() - new Date(a.published).getTime()
		);

		const channelName = sub?.channelName || videos[0]?.uploader || channelId;

		return { channelId, channelName, items: allItems, isSubscribed: !!sub };
	});
}

async function refreshChannel(channelId: string) {
	const db = await getDb();
	const sub = db.data.subscriptions.find((s) => s.channelId === channelId);
	if (sub) {
		await fetchAllFeeds([sub]);
	}
	return buildChannelData(channelId);
}

export function load({ params }) {
	const channelId = params.channelId;
	return {
		channel: buildChannelData(channelId),
		freshChannel: refreshChannel(channelId)
	};
}
