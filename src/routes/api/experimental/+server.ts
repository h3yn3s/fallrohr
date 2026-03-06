import { spawn, type ChildProcess } from 'child_process';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const parsed = new URL(targetUrl);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return new Response(JSON.stringify({ error: 'Only http/https URLs allowed' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? parseInt(limitParam, 10) : 0;

	let proc: ChildProcess | null = null;
	let timeout: ReturnType<typeof setTimeout> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const args = ['--flat-playlist', '--dump-json'];
			if (limit > 0) args.push('--playlist-items', `1:${limit}`);
			args.push('--', targetUrl);

			proc = spawn('yt-dlp', args);

			// 5-minute timeout
			timeout = setTimeout(
				() => {
					if (proc) {
						proc.kill('SIGTERM');
						setTimeout(() => {
							if (proc && !proc.killed) proc.kill('SIGKILL');
						}, 5000);
					}
				},
				5 * 60 * 1000
			);

			let buf = '';

			proc.stdout!.on('data', (chunk: Buffer) => {
				buf += chunk.toString();
				const lines = buf.split('\n');
				buf = lines.pop()!; // keep incomplete line in buffer
				for (const line of lines) {
					if (line.trim()) {
						try {
							controller.enqueue(`event: entry\ndata: ${line}\n\n`);
						} catch {
							// controller closed
						}
					}
				}
			});

			proc.stderr!.on('data', (chunk: Buffer) => {
				const msg = chunk.toString().trim();
				if (msg) {
					try {
						controller.enqueue(`event: stderr\ndata: ${JSON.stringify(msg)}\n\n`);
					} catch {
						// controller closed
					}
				}
			});

			proc.on('close', (code) => {
				if (timeout) clearTimeout(timeout);
				try {
					if (code === 0) {
						// flush remaining buffer
						if (buf.trim()) {
							controller.enqueue(`event: entry\ndata: ${buf}\n\n`);
						}
						controller.enqueue(`event: done\ndata: {}\n\n`);
					} else {
						controller.enqueue(`event: error\ndata: ${JSON.stringify({ code })}\n\n`);
					}
					controller.close();
				} catch {
					// already closed
				}
			});

			proc.on('error', (err) => {
				if (timeout) clearTimeout(timeout);
				try {
					controller.enqueue(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
					controller.close();
				} catch {
					// already closed
				}
			});
		},
		cancel() {
			if (timeout) clearTimeout(timeout);
			if (proc) {
				proc.kill('SIGTERM');
				setTimeout(() => {
					if (proc && !proc.killed) proc.kill('SIGKILL');
				}, 5000);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
