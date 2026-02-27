import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';

export async function POST({ request }) {
	const body = await request.json();
	const { id } = body;
	if (!id) {
		return json({ error: 'Missing id' }, { status: 400 });
	}

	const db = await getDb();
	let video = db.data.videos.find((v) => v.id === id);

	// For feed-only videos not yet downloaded, create a minimal entry
	if (!video) {
		video = {
			id,
			title: '',
			uploader: '',
			upload_date: '',
			duration: 1,
			resolution: '',
			filesize_approx: null,
			thumbnail: '',
			webpage_url: `https://www.youtube.com/watch?v=${id}`,
			description: '',
			downloaded_at: '',
			watch_progress: 0,
			last_watched_at: '',
			local: false,
			seen: true,
			channelId: ''
		};
		db.data.videos.push(video);
	}

	if (body.markWatched) {
		video.watch_progress = video.duration || 1;
	} else if (body.time != null) {
		video.watch_progress = body.time;
	} else {
		return json({ error: 'Missing time or markWatched' }, { status: 400 });
	}

	video.last_watched_at = new Date().toISOString();
	video.seen = true;

	await db.write();
	return json({ ok: true });
}
