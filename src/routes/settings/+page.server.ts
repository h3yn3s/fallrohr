import { readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR } from '$lib/db';

function getLibrarySizeBytes(): number {
	try {
		let total = 0;
		for (const file of readdirSync(DOWNLOAD_DIR)) {
			if (file.endsWith('.mp4')) {
				total += statSync(join(DOWNLOAD_DIR, file)).size;
			}
		}
		return total;
	} catch {
		return 0;
	}
}

async function loadSettings() {
	const db = await getDb();
	const localVideos = db.data.videos.filter((v) => v.local);
	const feedCount = db.data.feedItems.length;
	const librarySizeBytes = getLibrarySizeBytes();

	let totalWatchedSec = 0;
	let unwatchedDurationSec = 0;

	for (const v of db.data.videos) {
		totalWatchedSec += v.watch_progress;
	}

	for (const v of localVideos) {
		const percent = v.duration > 0 ? (v.watch_progress / v.duration) * 100 : 0;
		if (percent <= 5) {
			unwatchedDurationSec += v.duration;
		}
	}

	let ytdlpVersion = '';
	try {
		ytdlpVersion = execSync('yt-dlp --version', { timeout: 5000 }).toString().trim();
	} catch {
		ytdlpVersion = 'not found';
	}

	return {
		settings: db.data.settings,
		ytdlpVersion,
		stats: {
			downloaded: localVideos.length,
			feedCount,
			librarySizeGB: librarySizeBytes / (1024 * 1024 * 1024),
			totalWatchedSec,
			unwatchedDurationSec
		}
	};
}

export function load() {
	return { page: loadSettings() };
}
