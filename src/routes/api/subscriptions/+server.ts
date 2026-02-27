import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import { getDb, type Subscription } from '$lib/db';

export async function GET() {
	const db = await getDb();
	return json(db.data.subscriptions);
}

export async function POST({ request }) {
	const { url } = await request.json();
	if (!url) {
		return json({ error: 'Missing url' }, { status: 400 });
	}

	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return json({ error: 'Only http/https URLs allowed' }, { status: 400 });
		}
	} catch {
		return json({ error: 'Invalid URL' }, { status: 400 });
	}

	// Use yt-dlp to resolve channel info
	const info = await new Promise<{ channelId: string; channelName: string }>((resolve, reject) => {
		const proc = spawn('yt-dlp', [
			'--print',
			'channel_id',
			'--print',
			'channel',
			'--playlist-items',
			'1',
			'--',
			url
		]);

		const timeout = setTimeout(() => {
			proc.kill('SIGTERM');
			reject(new Error('Timed out resolving channel'));
		}, 30000);

		let out = '';
		proc.stdout.on('data', (chunk: Buffer) => {
			out += chunk.toString();
		});

		let err = '';
		proc.stderr.on('data', (chunk: Buffer) => {
			err += chunk.toString();
		});

		proc.on('close', (code) => {
			clearTimeout(timeout);
			if (code !== 0) return reject(new Error(err || 'yt-dlp failed'));
			const lines = out.trim().split('\n');
			resolve({ channelId: lines[0], channelName: lines[1] });
		});
	});

	const db = await getDb();

	if (db.data.subscriptions.some((s) => s.channelId === info.channelId)) {
		return json({ error: 'Already subscribed' }, { status: 409 });
	}

	const sub: Subscription = {
		channelId: info.channelId,
		channelName: info.channelName,
		feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${info.channelId}`,
		addedAt: new Date().toISOString()
	};

	db.data.subscriptions.push(sub);
	await db.write();

	return json(sub, { status: 201 });
}
