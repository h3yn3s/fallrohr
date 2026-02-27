import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';

export async function POST({ request }) {
	const { channel } = await request.json();
	const cmd = channel === 'nightly' ? 'yt-dlp --update-to nightly' : 'yt-dlp -U';

	try {
		const output = execSync(cmd, { timeout: 60000 }).toString().trim();
		return json({ ok: true, output });
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return json({ ok: false, output: msg }, { status: 500 });
	}
}
