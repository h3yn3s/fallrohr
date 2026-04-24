import { readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR } from '$lib/db';

declare const __APP_VERSION__: string;

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

function getAudioStats(): { count: number; sizeBytes: number; missing: number } {
	try {
		const files = readdirSync(DOWNLOAD_DIR);
		const mp4s = new Set(files.filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)));
		const m4as = new Set(files.filter((f) => f.endsWith('.m4a')).map((f) => f.slice(0, -4)));
		let sizeBytes = 0;
		for (const base of m4as) {
			sizeBytes += statSync(join(DOWNLOAD_DIR, `${base}.m4a`)).size;
		}
		let missing = 0;
		for (const base of mp4s) {
			if (!m4as.has(base)) missing++;
		}
		return { count: m4as.size, sizeBytes, missing };
	} catch {
		return { count: 0, sizeBytes: 0, missing: 0 };
	}
}

async function loadSettings() {
	const db = await getDb();
	const localVideos = db.data.videos.filter((v) => v.local);
	const feedCount = db.data.feedItems.length;
	const librarySizeBytes = getLibrarySizeBytes();
	const audio = getAudioStats();

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
		appVersion: __APP_VERSION__,
		settings: db.data.settings,
		ytdlpVersion,
		stats: {
			downloaded: localVideos.length,
			feedCount,
			librarySizeGB: librarySizeBytes / (1024 * 1024 * 1024),
			totalWatchedSec,
			unwatchedDurationSec,
			audioCount: audio.count,
			audioSizeGB: audio.sizeBytes / (1024 * 1024 * 1024),
			audioMissing: audio.missing
		}
	};
}

export function load() {
	return { page: loadSettings() };
}
