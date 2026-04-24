import { getDb, DOWNLOAD_DIR } from '$lib/db';
import { error } from '@sveltejs/kit';
import { existsSync } from 'fs';
import { join } from 'path';

// Vidstack custom elements upgrade themselves on connectedCallback, which
// collides with Svelte hydration after a full page reload. Skipping SSR for
// this page avoids the hydration race entirely.
export const ssr = false;

export async function load({ params }) {
	const db = await getDb();
	const video = db.data.videos.find((v) => v.id === params.id);
	if (!video) return error(404, 'Video not found');
	if (!video.seen) {
		video.seen = true;
		await db.write();
	}
	const hasAudio = existsSync(join(DOWNLOAD_DIR, `${video.id}.m4a`));
	return { video, hasAudio };
}
