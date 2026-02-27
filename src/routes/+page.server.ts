import { getDb } from '$lib/db';

async function loadContinueWatching() {
	const db = await getDb();

	return db.data.videos
		.filter((v) => {
			if (!v.local || !v.watch_progress || !v.duration) return false;
			const pct = (v.watch_progress / v.duration) * 100;
			return pct > 0 && pct < 95;
		})
		.sort((a, b) => {
			const aTime = a.last_watched_at || a.downloaded_at || '';
			const bTime = b.last_watched_at || b.downloaded_at || '';
			return bTime.localeCompare(aTime);
		});
}

async function loadNew() {
	const db = await getDb();

	return db.data.videos
		.filter((v) => v.local && !v.seen && v.watch_progress === 0)
		.sort((a, b) => {
			const aTime = a.downloaded_at || '';
			const bTime = b.downloaded_at || '';
			return bTime.localeCompare(aTime);
		});
}

async function loadReadyToWatch() {
	const db = await getDb();

	return db.data.videos
		.filter((v) => {
			if (!v.local) return false;
			if (v.seen === false) return false;
			if (!v.watch_progress || !v.duration) return true;
			const pct = (v.watch_progress / v.duration) * 100;
			return pct === 0;
		})
		.sort((a, b) => {
			const aTime = a.downloaded_at || '';
			const bTime = b.downloaded_at || '';
			return bTime.localeCompare(aTime);
		});
}

export function load() {
	return {
		videos: loadContinueWatching(),
		newVideos: loadNew(),
		readyToWatch: loadReadyToWatch()
	};
}
