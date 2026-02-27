import { json } from '@sveltejs/kit';
import { execFileSync } from 'child_process';

export async function POST({ request }) {
	const { channel } = await request.json();
	const args = channel === 'nightly' ? ['--update-to', 'nightly'] : ['-U'];

	try {
		const output = execFileSync('yt-dlp', args, { timeout: 60000 }).toString().trim();
		return json({ ok: true, output });
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return json({ ok: false, output: msg }, { status: 500 });
	}
}
