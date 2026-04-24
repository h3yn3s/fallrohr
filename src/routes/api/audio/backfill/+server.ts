import { json } from '@sveltejs/kit';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR } from '$lib/db';
import { extractAudio } from '$lib/server/media';

let running = false;

export async function GET() {
	return json({ running });
}

export async function POST() {
	if (running) {
		return json({ error: 'Already running' }, { status: 409 });
	}
	running = true;

	const db = await getDb();
	const bitrate = db.data.settings.audioBitrate || 192;

	let scanned = 0;
	let extracted = 0;
	let skipped = 0;
	let failed = 0;

	try {
		const files = readdirSync(DOWNLOAD_DIR).filter((f) => f.endsWith('.mp4'));
		scanned = files.length;

		for (const file of files) {
			const base = file.slice(0, -4);
			const mp4Path = join(DOWNLOAD_DIR, file);
			const m4aPath = join(DOWNLOAD_DIR, `${base}.m4a`);
			if (existsSync(m4aPath)) {
				skipped++;
				continue;
			}
			try {
				await extractAudio(mp4Path, m4aPath, bitrate);
				extracted++;
			} catch (err) {
				failed++;
				console.error(`[backfill] failed: ${file}`, err);
			}
		}
	} finally {
		running = false;
	}

	return json({ scanned, extracted, skipped, failed });
}
