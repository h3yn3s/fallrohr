import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, DOWNLOAD_DIR, type VideoMeta } from '$lib/db';
import { generateThumbnail, probeResolution, probeDuration } from '$lib/server/media';
import { runCleanup } from '$lib/server/cleanup';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const title = (formData.get('title') as string)?.trim() || '';
	const uploader = (formData.get('uploader') as string)?.trim() || '';
	const date = (formData.get('date') as string)?.trim() || '';

	if (!file || file.size === 0) {
		return json({ error: 'No file provided' }, { status: 400 });
	}

	if (!file.name.endsWith('.mp4') && file.type !== 'video/mp4') {
		return json({ error: 'Only MP4 files are supported' }, { status: 400 });
	}

	mkdirSync(DOWNLOAD_DIR, { recursive: true });

	const videoId = createHash('sha256')
		.update(file.name + Date.now())
		.digest('hex')
		.slice(0, 12);

	const videoPath = join(DOWNLOAD_DIR, `${videoId}.mp4`);
	const thumbPath = join(DOWNLOAD_DIR, `${videoId}.jpg`);

	const buffer = Buffer.from(await file.arrayBuffer());
	writeFileSync(videoPath, buffer);

	let resolution = '';
	let duration = 0;

	try {
		resolution = await probeResolution(videoPath);
	} catch {
		// non-fatal
	}

	try {
		duration = await probeDuration(videoPath);
	} catch {
		// non-fatal
	}

	try {
		await generateThumbnail(videoPath, thumbPath);
	} catch {
		// non-fatal — video will work without thumbnail
	}

	const uploadDate = date
		? date.replace(/-/g, '')
		: new Date().toISOString().slice(0, 10).replace(/-/g, '');
	const videoTitle = title || file.name.replace(/\.mp4$/i, '');

	const db = await getDb();

	const meta: VideoMeta = {
		id: videoId,
		title: videoTitle,
		uploader,
		upload_date: uploadDate,
		duration,
		resolution,
		filesize_approx: file.size,
		thumbnail: '',
		webpage_url: '',
		description: '',
		downloaded_at: new Date().toISOString(),
		watch_progress: 0,
		last_watched_at: '',
		local: true,
		seen: false,
		channelId: ''
	};

	db.data.videos.push(meta);
	await db.write();
	await runCleanup();

	return json({ id: videoId });
};
