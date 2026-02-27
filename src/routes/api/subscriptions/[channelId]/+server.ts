import { json } from '@sveltejs/kit';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR } from '$lib/db';

export async function PATCH({ params, request }) {
	const db = await getDb();
	const sub = db.data.subscriptions.find((s) => s.channelId === params.channelId);
	if (!sub) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	const body = await request.json();
	if (typeof body.autoDownload === 'boolean') {
		sub.autoDownload = body.autoDownload;
	}

	await db.write();
	return json(sub);
}

export async function DELETE({ params }) {
	const db = await getDb();
	const sub = db.data.subscriptions.find((s) => s.channelId === params.channelId);
	if (!sub) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	// Remove local files for videos from this channel
	const channelVideos = db.data.videos.filter((v) => v.uploader === sub.channelName);
	for (const video of channelVideos) {
		for (const ext of ['.mp4', '.jpg']) {
			try {
				unlinkSync(join(DOWNLOAD_DIR, `${video.id}${ext}`));
			} catch {
				// file may not exist
			}
		}
	}

	// Remove videos, feed items, and subscription from db
	db.data.videos = db.data.videos.filter((v) => v.uploader !== sub.channelName);
	db.data.feedItems = db.data.feedItems.filter((f) => f.channelId !== params.channelId);
	db.data.subscriptions = db.data.subscriptions.filter((s) => s.channelId !== params.channelId);
	await db.write();

	return json({ ok: true });
}
