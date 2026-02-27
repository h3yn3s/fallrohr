import { json } from '@sveltejs/kit';
import { enqueue, cancelJob, cancelAll, subscribe } from '$lib/server/downloads';

let activeConnections = 0;

export function GET({ url }) {
	const videoUrl = url.searchParams.get('url');

	if (videoUrl) {
		const videoId = url.searchParams.get('videoId') ?? undefined;
		const metaOverrides: Record<string, string> = {};
		for (const key of ['title', 'uploader', 'uploadDate']) {
			const val = url.searchParams.get(key);
			if (val) metaOverrides[key] = val;
		}
		const job = enqueue(
			videoUrl,
			videoId,
			Object.keys(metaOverrides).length > 0 ? metaOverrides : undefined
		);
		return json({ jobId: job.id });
	}

	// SSE stream
	const encoder = new TextEncoder();
	let unsubscribe: () => void;
	let heartbeat: ReturnType<typeof setInterval>;
	activeConnections++;

	const stream = new ReadableStream({
		start(controller) {
			const send = (event: string, data: string) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
				} catch {
					cleanup();
				}
			};
			unsubscribe = subscribe(send);
			// Keepalive every 15s to prevent proxy/browser timeouts
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					cleanup();
				}
			}, 15000);
		},
		cancel() {
			cleanup();
		}
	});

	function cleanup() {
		activeConnections--;
		clearInterval(heartbeat);
		unsubscribe?.();
	}

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

export async function DELETE({ url }) {
	const idParam = url.searchParams.get('id');

	if (!idParam) {
		cancelAll();
		return json({ ok: true });
	}

	const jobId = parseInt(idParam);
	if (isNaN(jobId)) {
		return json({ error: 'Invalid job id' }, { status: 400 });
	}
	cancelJob(jobId);
	return json({ ok: true });
}
