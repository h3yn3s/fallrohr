import { getDb } from '$lib/db';
import { error } from '@sveltejs/kit';

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
	return { video };
}
