import { createReadStream, statSync } from 'fs';
import { join } from 'path';
import { DOWNLOAD_DIR } from '$lib/db';
import { error } from '@sveltejs/kit';

const MIME: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.m4a': 'audio/mp4',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp'
};

/** Wrap a Node createReadStream into a web ReadableStream with proper cleanup */
function nodeStreamToWeb(filePath: string, opts?: { start: number; end: number }): ReadableStream {
	let nodeStream: ReturnType<typeof createReadStream>;
	return new ReadableStream({
		start(controller) {
			nodeStream = createReadStream(filePath, opts);
			nodeStream.on('data', (chunk: string | Buffer) => {
				try {
					controller.enqueue(
						typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
					);
				} catch {
					nodeStream.destroy();
				}
			});
			nodeStream.on('end', () => {
				try {
					controller.close();
				} catch {
					// already closed
				}
			});
			nodeStream.on('error', () => {
				try {
					controller.error(new Error('Read failed'));
				} catch {
					// already errored/closed
				}
			});
		},
		cancel() {
			nodeStream?.destroy();
		}
	});
}

export function GET({ params, request, url }) {
	const filePath = join(DOWNLOAD_DIR, params.path);

	// Prevent path traversal (trailing separator guards against sibling dir names)
	const safeDirPrefix = DOWNLOAD_DIR.endsWith('/') ? DOWNLOAD_DIR : DOWNLOAD_DIR + '/';
	if (!filePath.startsWith(safeDirPrefix)) {
		return error(403);
	}

	let stat;
	try {
		stat = statSync(filePath);
	} catch {
		return error(404);
	}

	const ext = filePath.slice(filePath.lastIndexOf('.'));
	const contentType = MIME[ext] ?? 'application/octet-stream';
	const downloadName = url.searchParams.get('download');

	// Handle range requests for video/audio seeking
	const range = request.headers.get('range');
	if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
		const parts = range.replace(/bytes=/, '').split('-');
		const start = parseInt(parts[0], 10);
		const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

		// Clamp to actual file size
		const clampedEnd = Math.min(end, stat.size - 1);
		if (start > clampedEnd || start < 0) {
			return new Response(null, {
				status: 416,
				headers: { 'Content-Range': `bytes */${stat.size}` }
			});
		}
		const chunkSize = clampedEnd - start + 1;

		return new Response(nodeStreamToWeb(filePath, { start, end: clampedEnd }), {
			status: 206,
			headers: {
				'Content-Range': `bytes ${start}-${clampedEnd}/${stat.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(chunkSize),
				'Content-Type': contentType
			}
		});
	}

	const headers: Record<string, string> = {
		'Content-Length': String(stat.size),
		'Content-Type': contentType,
		'Accept-Ranges': 'bytes'
	};
	if (contentType.startsWith('image/')) {
		headers['Cache-Control'] = 'public, max-age=86400, immutable';
	}
	if (downloadName) {
		const safeName = downloadName.replace(/["\\\n\r]/g, '_');
		headers['Content-Disposition'] = `attachment; filename="${safeName}"`;
	}

	return new Response(nodeStreamToWeb(filePath), { headers });
}
