import { json } from '@sveltejs/kit';
import { checkFeeds } from '$lib/server/cron';

export async function POST() {
	await checkFeeds('manual');
	return json({ ok: true });
}
