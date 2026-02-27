import { getDb } from '$lib/db';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const db = await getDb();
	const video = db.data.videos.find((v) => v.id === params.id);
	if (!video) return error(404, 'Video not found');
	if (!video.seen) {
		video.seen = true;
		await db.write();
	}
	return { video };
}
