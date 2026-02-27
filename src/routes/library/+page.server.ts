import { getDb, type VideoMeta } from '$lib/db';

async function loadLibrary() {
	const db = await getDb();

	const videos = db.data.videos.filter((v) => v.local);
	const channelNames = [...new Set(videos.map((v) => v.uploader || 'Unknown'))].sort((a, b) =>
		a.localeCompare(b)
	);

	return { videos, channelNames };
}

export function load() {
	return { library: loadLibrary() };
}
