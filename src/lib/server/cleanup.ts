import { unlinkSync } from 'fs';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR, type VideoMeta } from '$lib/db';

function removeVideoFile(video: VideoMeta) {
	// Only remove the .mp4, keep the .jpg thumbnail and db entry
	try {
		unlinkSync(join(DOWNLOAD_DIR, `${video.id}.mp4`));
	} catch {
		// file may not exist
	}
}

export async function runCleanup() {
	const db = await getDb();
	const { keepUnwatched, keepWatched } = db.data.settings;

	// Only consider videos that are still local
	const localVideos = db.data.videos.filter((v) => v.local);

	// Group by uploader (channel)
	const byChannel: Record<string, VideoMeta[]> = {};
	for (const video of localVideos) {
		const ch = video.uploader || 'Unknown';
		if (!byChannel[ch]) byChannel[ch] = [];
		byChannel[ch].push(video);
	}

	let cleaned = 0;

	for (const videos of Object.values(byChannel)) {
		const watched = videos
			.filter((v) => v.duration > 0 && (v.watch_progress / v.duration) * 100 > 95)
			.sort((a, b) => new Date(b.downloaded_at).getTime() - new Date(a.downloaded_at).getTime());

		const unwatched = videos
			.filter((v) => !v.duration || (v.watch_progress / v.duration) * 100 <= 95)
			.sort((a, b) => new Date(b.downloaded_at).getTime() - new Date(a.downloaded_at).getTime());

		// Soft-delete oldest watched beyond keepWatched
		if (watched.length > keepWatched) {
			for (const v of watched.slice(keepWatched)) {
				removeVideoFile(v);
				v.local = false;
				cleaned++;
			}
		}

		// Soft-delete oldest unwatched beyond keepUnwatched
		if (unwatched.length > keepUnwatched) {
			for (const v of unwatched.slice(keepUnwatched)) {
				removeVideoFile(v);
				v.local = false;
				cleaned++;
			}
		}
	}

	if (cleaned > 0) {
		await db.write();
	}
}
