import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR, type VideoMeta } from '$lib/db';
import { runCleanup } from '$lib/server/cleanup';
import { generateThumbnail, probeResolution, extractAudio } from '$lib/server/media';

type Listener = (event: string, data: string) => void;

export interface MetaOverrides {
	title?: string;
	uploader?: string;
	uploadDate?: string;
}

export interface DownloadJob {
	id: number;
	videoUrl: string;
	videoId?: string;
	title?: string;
	metaOverrides?: MetaOverrides;
	status: 'queued' | 'metadata' | 'downloading' | 'done' | 'error' | 'cancelled';
	progress: number;
	logs: string[];
}

const jobs: DownloadJob[] = [];
const activeProcs = new Map<number, ChildProcess>();
const activeTimers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners: Set<Listener> = new Set();
let nextId = 1;
let processing = false;

const METADATA_TIMEOUT = 2 * 60 * 1000; // 2 minutes for metadata
const DOWNLOAD_TIMEOUT = 60 * 60 * 1000; // 60 minutes for download

function setJobTimeout(job: DownloadJob, ms: number, label: string) {
	clearJobTimeout(job.id);
	activeTimers.set(
		job.id,
		setTimeout(() => {
			console.error(`[queue] job#${job.id} ${label} timed out after ${ms / 1000}s`);
			const proc = activeProcs.get(job.id);
			if (proc) {
				proc.kill('SIGTERM');
				setTimeout(() => {
					if (!proc.killed) proc.kill('SIGKILL');
				}, 5000);
			}
			activeProcs.delete(job.id);
			activeTimers.delete(job.id);
			job.status = 'error';
			markFinished(job);
			jobLog(job, `Timed out during ${label}`);
			jobUpdate(job);
			processNext();
		}, ms)
	);
}

function clearJobTimeout(jobId: number) {
	const timer = activeTimers.get(jobId);
	if (timer) {
		clearTimeout(timer);
		activeTimers.delete(jobId);
	}
}

export function getQueue() {
	return jobs.map(({ logs: _l, metaOverrides: _m, ...rest }) => rest);
}

export function getJobLogs(jobId: number) {
	return jobs.find((j) => j.id === jobId)?.logs ?? [];
}

function isSafeUrl(s: string): boolean {
	try {
		const u = new URL(s);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

export function enqueue(
	videoUrl: string,
	videoId?: string,
	metaOverrides?: MetaOverrides
): DownloadJob {
	if (!isSafeUrl(videoUrl)) {
		throw new Error('Invalid URL: only http/https allowed');
	}
	// Deduplicate: if same URL or videoId is already queued/active, return existing
	const existing = jobs.find(
		(j) =>
			(j.status === 'queued' || j.status === 'metadata' || j.status === 'downloading') &&
			(j.videoUrl === videoUrl || (videoId && j.videoId === videoId))
	);
	if (existing) {
		console.log(`[queue] dedup hit job#${existing.id} for ${videoUrl}`);
		return existing;
	}

	const job: DownloadJob = {
		id: nextId++,
		videoUrl,
		videoId,
		metaOverrides,
		status: 'queued',
		progress: 0,
		logs: []
	};
	jobs.push(job);
	console.log(
		`[queue] enqueued job#${job.id} url=${videoUrl} queue_depth=${jobs.filter((j) => j.status === 'queued').length}`
	);
	emit('queue', JSON.stringify(getQueue()));

	if (!processing) processNext();
	return job;
}

export function cancelJob(jobId: number) {
	const job = jobs.find((j) => j.id === jobId);
	if (!job) return;
	console.log(`[queue] cancel job#${jobId} (was ${job.status})`);

	const wasActive = job.status === 'metadata' || job.status === 'downloading';

	if (wasActive) {
		clearJobTimeout(jobId);
		const proc = activeProcs.get(jobId);
		if (proc) {
			proc.kill('SIGTERM');
			activeProcs.delete(jobId);
		}
	}

	job.status = 'cancelled';
	markFinished(job);
	jobLog(job, 'Cancelled.');
	jobUpdate(job);
	cleanupFiles(job.videoId);

	if (wasActive) processNext();
}

export function cancelAll() {
	console.log(`[queue] cancelAll called`);
	const active = jobs.filter(
		(j) => j.status === 'queued' || j.status === 'metadata' || j.status === 'downloading'
	);
	for (const job of active) {
		clearJobTimeout(job.id);
		const proc = activeProcs.get(job.id);
		if (proc) {
			proc.kill('SIGTERM');
			activeProcs.delete(job.id);
		}
		job.status = 'cancelled';
		markFinished(job);
		cleanupFiles(job.videoId);
	}
	processing = false;
	emit('queue', JSON.stringify(getQueue()));
}

function cleanupFiles(videoId?: string) {
	if (!videoId) return;
	try {
		for (const file of readdirSync(DOWNLOAD_DIR)) {
			if (file.startsWith(videoId)) {
				try {
					unlinkSync(join(DOWNLOAD_DIR, file));
				} catch {
					// may not exist
				}
			}
		}
	} catch {
		// dir may not exist
	}
}

export function subscribe(listener: Listener): () => void {
	// Send current queue state
	listener('queue', JSON.stringify(getQueue()));
	listeners.add(listener);
	console.log(`[sse] client connected (${listeners.size} total)`);
	return () => {
		listeners.delete(listener);
		console.log(`[sse] client disconnected (${listeners.size} remaining)`);
	};
}

function emit(event: string, data: string) {
	const t0 = performance.now();
	let failed = 0;
	for (const listener of listeners) {
		try {
			listener(event, data);
		} catch {
			listeners.delete(listener);
			failed++;
		}
	}
	const ms = (performance.now() - t0).toFixed(1);
	if (parseFloat(ms) > 5 || failed > 0) {
		console.log(`[sse] emit ${event} to ${listeners.size} clients took ${ms}ms (${failed} failed)`);
	}
}

// Throttled log batching — only logs are noisy, everything else is immediate
const pendingLogs = new Map<number, string[]>();
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLogFlush() {
	if (logFlushTimer) return;
	logFlushTimer = setTimeout(flushLogs, 1000);
}

function flushLogs() {
	logFlushTimer = null;
	for (const [jobId, lines] of pendingLogs) {
		emit('log', JSON.stringify({ id: jobId, lines }));
	}
	pendingLogs.clear();
}

function jobLog(job: DownloadJob, msg: string) {
	job.logs.push(msg);
	const pending = pendingLogs.get(job.id);
	if (pending) {
		pending.push(msg);
	} else {
		pendingLogs.set(job.id, [msg]);
	}
	scheduleLogFlush();
}

// Throttled progress updates — yt-dlp can emit dozens of progress lines per second
let pendingUpdates = new Map<number, DownloadJob>();
let updateFlushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleUpdateFlush() {
	if (updateFlushTimer) return;
	updateFlushTimer = setTimeout(flushUpdates, 500);
}

function flushUpdates() {
	updateFlushTimer = null;
	for (const [, job] of pendingUpdates) {
		const { logs: _l, metaOverrides: _m, ...rest } = job;
		emit('update', JSON.stringify(rest));
	}
	pendingUpdates.clear();
}

function jobUpdate(job: DownloadJob) {
	const { logs: _l, metaOverrides: _m, ...rest } = job;
	// Status changes are sent immediately; progress-only updates are throttled
	if (job.status !== 'downloading' || rest.progress >= 100) {
		pendingUpdates.delete(job.id);
		emit('update', JSON.stringify(rest));
	} else {
		pendingUpdates.set(job.id, job);
		scheduleUpdateFlush();
	}
}

function pruneFinished() {
	// Remove done/error/cancelled jobs older than 5 minutes
	const cutoff = Date.now() - 5 * 60 * 1000;
	for (let i = jobs.length - 1; i >= 0; i--) {
		const j = jobs[i];
		if (
			(j.status === 'done' || j.status === 'error' || j.status === 'cancelled') &&
			(j as DownloadJob & { _finishedAt?: number })._finishedAt &&
			(j as DownloadJob & { _finishedAt?: number })._finishedAt! < cutoff
		) {
			jobs.splice(i, 1);
		}
	}
}

function markFinished(job: DownloadJob) {
	(job as DownloadJob & { _finishedAt: number })._finishedAt = Date.now();
}

const PLAYLIST_HOSTS = [
	'youtube.com',
	'youtu.be',
	'vimeo.com',
	'dailymotion.com',
	'soundcloud.com',
	'bandcamp.com',
	'twitch.tv'
];

function mayHavePlaylist(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, '');
		return PLAYLIST_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
	} catch {
		return true;
	}
}

function processNext() {
	pruneFinished();
	const job = jobs.find((j) => j.status === 'queued');
	if (!job) {
		processing = false;
		console.log(`[queue] idle — no more queued jobs (${jobs.length} total in list)`);
		return;
	}

	processing = true;
	console.log(
		`[queue] processing job#${job.id} (${jobs.filter((j) => j.status === 'queued').length} queued remaining)`
	);
	runJob(job);
}

function runJob(job: DownloadJob) {
	mkdirSync(DOWNLOAD_DIR, { recursive: true });

	job.status = 'metadata';
	jobUpdate(job);

	// Skip playlist resolve when we already know it's a single video
	// or when the URL isn't from a platform that supports playlists
	if (job.videoId || !mayHavePlaylist(job.videoUrl)) {
		runSingleVideo(job);
		return;
	}

	jobLog(job, 'Resolving URL...');

	// Step 1: Flat-playlist resolve to detect playlists
	const resolveArgs = ['--flat-playlist', '--dump-json', '--', job.videoUrl];
	jobLog(job, `$ yt-dlp ${resolveArgs.join(' ')}`);
	const resolveStart = performance.now();
	console.log(`[cmd] job#${job.id} spawn: yt-dlp --flat-playlist --dump-json`);
	const resolveProc = spawn('yt-dlp', resolveArgs);
	activeProcs.set(job.id, resolveProc);
	setJobTimeout(job, METADATA_TIMEOUT, 'resolve');
	let resolveBuf = '';

	resolveProc.stdout.on('data', (chunk: Buffer) => {
		resolveBuf += chunk.toString();
	});

	resolveProc.stderr.on('data', (chunk: Buffer) => {
		for (const line of chunk.toString().split('\n').filter(Boolean)) {
			console.error(`[yt-dlp] job#${job.id} resolve: ${line}`);
			jobLog(job, line);
		}
	});

	resolveProc.on('close', (code) => {
		activeProcs.delete(job.id);
		clearJobTimeout(job.id);
		const resolveSec = ((performance.now() - resolveStart) / 1000).toFixed(1);
		console.log(`[cmd] job#${job.id} flat-playlist exited code=${code} after ${resolveSec}s`);
		if (job.status === 'cancelled') return;

		if (code !== 0) {
			job.status = 'error';
			markFinished(job);
			console.error(`[cmd] job#${job.id} flat-playlist FAILED url=${job.videoUrl}`);
			jobLog(job, 'Failed to resolve URL');
			jobUpdate(job);
			processNext();
			return;
		}

		const entries = resolveBuf
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return null;
				}
			})
			.filter(Boolean) as Record<string, unknown>[];

		if (entries.length === 0) {
			job.status = 'error';
			markFinished(job);
			jobLog(job, 'No videos found');
			jobUpdate(job);
			processNext();
			return;
		}

		if (entries.length > 1) {
			// Playlist detected — enqueue each video individually
			jobLog(job, `Playlist with ${entries.length} videos — queueing each...`);
			for (const entry of entries) {
				const videoUrl = (entry.url ?? entry.webpage_url ?? entry.original_url) as string;
				const videoId = entry.id as string | undefined;
				if (videoUrl) enqueue(videoUrl, videoId, job.metaOverrides);
			}
			job.status = 'done';
			job.title = `Playlist (${entries.length} videos)`;
			markFinished(job);
			jobUpdate(job);
			processNext();
			return;
		}

		// Single video — proceed to full metadata + download
		runSingleVideo(job);
	});

	resolveProc.on('error', (err) => {
		job.status = 'error';
		markFinished(job);
		console.error(`[cmd] job#${job.id} flat-playlist spawn error:`, err.message);
		jobLog(job, err.message);
		jobUpdate(job);
		processNext();
	});
}

function runSingleVideo(job: DownloadJob) {
	jobLog(job, 'Fetching video metadata...');

	const metaArgs = ['--dump-json', '--no-download', '--', job.videoUrl];
	jobLog(job, `$ yt-dlp ${metaArgs.join(' ')}`);
	const metaStart = performance.now();
	console.log(`[cmd] job#${job.id} spawn: yt-dlp --dump-json --no-download`);
	const metaProc = spawn('yt-dlp', metaArgs);
	activeProcs.set(job.id, metaProc);
	setJobTimeout(job, METADATA_TIMEOUT, 'metadata');
	let jsonBuf = '';

	metaProc.stdout.on('data', (chunk: Buffer) => {
		jsonBuf += chunk.toString();
	});

	metaProc.stderr.on('data', (chunk: Buffer) => {
		for (const line of chunk.toString().split('\n').filter(Boolean)) {
			console.error(`[yt-dlp] job#${job.id} meta: ${line}`);
			jobLog(job, line);
		}
	});

	metaProc.on('close', async (code) => {
		activeProcs.delete(job.id);
		clearJobTimeout(job.id);
		const metaSec = ((performance.now() - metaStart) / 1000).toFixed(1);
		console.log(`[cmd] job#${job.id} metadata exited code=${code} after ${metaSec}s`);

		if (job.status === 'cancelled') return;

		if (code !== 0) {
			job.status = 'error';
			markFinished(job);
			console.error(`[cmd] job#${job.id} metadata FAILED url=${job.videoUrl}`);
			jobLog(job, 'Failed to fetch metadata');
			jobUpdate(job);
			processNext();
			return;
		}

		let info: Record<string, unknown>;
		try {
			info = JSON.parse(jsonBuf);
		} catch {
			job.status = 'error';
			markFinished(job);
			jobLog(job, 'Failed to parse metadata JSON');
			jobUpdate(job);
			processNext();
			return;
		}

		const rawId = info.id as string;
		const isCleanId = rawId && rawId.length <= 40 && info.extractor_key !== 'Generic';
		const videoId = isCleanId
			? rawId
			: createHash('sha256').update(job.videoUrl).digest('hex').slice(0, 12);
		const thumbUrl = info.thumbnail as string;
		// Apply metadata overrides
		if (job.metaOverrides?.title) info.title = job.metaOverrides.title;
		if (job.metaOverrides?.uploader) {
			info.uploader = job.metaOverrides.uploader;
			info.channel = job.metaOverrides.uploader;
		}
		if (job.metaOverrides?.uploadDate)
			info.upload_date = job.metaOverrides.uploadDate.replace(/-/g, '');
		job.videoId = videoId;
		job.title = info.title as string;
		job.status = 'downloading';
		jobUpdate(job);

		jobLog(job, `Video: ${info.title}`);
		jobLog(job, `Uploader: ${info.uploader}`);

		// Download thumbnail
		if (thumbUrl) {
			jobLog(job, 'Saving thumbnail...');
			fetch(thumbUrl)
				.then((r) => r.arrayBuffer())
				.then((buf) => {
					writeFileSync(join(DOWNLOAD_DIR, `${videoId}.jpg`), Buffer.from(buf));
					jobLog(job, 'Thumbnail saved.');
				})
				.catch(() => jobLog(job, 'Warning: failed to save thumbnail'));
		}

		// Download video
		const outPath = join(DOWNLOAD_DIR, `${videoId}.mp4`);
		const db = await getDb();
		const maxRes = db.data.settings.maxResolution || 1440;
		const dlArgs = [
			'-f',
			`bestvideo[height<=${maxRes}]+bestaudio/best[height<=${maxRes}]/best`,
			'--merge-output-format',
			'mp4',
			'--newline',
			'-o',
			outPath,
			'--',
			job.videoUrl
		];
		jobLog(job, `$ yt-dlp ${dlArgs.join(' ')}`);
		const dlStart = performance.now();
		console.log(`[cmd] job#${job.id} spawn: yt-dlp download (maxRes=${maxRes})`);
		const dlProc = spawn('yt-dlp', dlArgs);
		activeProcs.set(job.id, dlProc);
		setJobTimeout(job, DOWNLOAD_TIMEOUT, 'download');

		dlProc.stdout.on('data', (chunk: Buffer) => {
			for (const line of chunk.toString().split('\n').filter(Boolean)) {
				jobLog(job, line);
				const match = line.match(/(\d+\.?\d*)%/);
				if (match) {
					job.progress = parseFloat(match[1]);
					jobUpdate(job);
				}
			}
		});

		dlProc.stderr.on('data', (chunk: Buffer) => {
			for (const line of chunk.toString().split('\n').filter(Boolean)) {
				console.error(`[yt-dlp] job#${job.id} dl: ${line}`);
				jobLog(job, line);
			}
		});

		dlProc.on('close', async (dlCode) => {
			activeProcs.delete(job.id);
			clearJobTimeout(job.id);
			const dlSec = ((performance.now() - dlStart) / 1000).toFixed(1);
			console.log(`[cmd] job#${job.id} download exited code=${dlCode} after ${dlSec}s`);

			if (job.status === 'cancelled') return;

			try {
				const db = await getDb();

				if (dlCode === 0) {
					job.status = 'done';
					job.progress = 100;

					// Generate thumbnail from video if not already saved
					const thumbPath = join(DOWNLOAD_DIR, `${videoId}.jpg`);
					if (!existsSync(thumbPath)) {
						try {
							await generateThumbnail(outPath, thumbPath);
							jobLog(job, 'Thumbnail generated from video.');
						} catch {
							jobLog(job, 'Warning: failed to generate thumbnail');
						}
					}

					// Extract audio-only m4a alongside the mp4
					const audioPath = join(DOWNLOAD_DIR, `${videoId}.m4a`);
					try {
						await extractAudio(outPath, audioPath);
						jobLog(job, 'Audio track extracted (m4a).');
					} catch {
						jobLog(job, 'Warning: failed to extract audio');
					}

					const existing = db.data.videos.find((v) => v.id === videoId);
					const actualRes = await probeResolution(outPath);

					const meta: VideoMeta = {
						id: videoId,
						title: info.title as string,
						uploader: (info.uploader ?? info.channel ?? '') as string,
						upload_date: (info.upload_date ?? '') as string,
						duration: (info.duration ?? 0) as number,
						resolution: actualRes || ((info.resolution ?? '') as string),
						filesize_approx: (info.filesize_approx as number) ?? null,
						thumbnail: (info.thumbnail ?? '') as string,
						webpage_url: (info.webpage_url ?? '') as string,
						description: (info.description ?? '') as string,
						downloaded_at: new Date().toISOString(),
						watch_progress: existing?.watch_progress ?? 0,
						last_watched_at: existing?.last_watched_at ?? '',
						local: true,
						seen: false,
						channelId: (info.channel_id ?? '') as string
					};

					db.data.videos = db.data.videos.filter((v) => v.id !== videoId);
					db.data.videos.push(meta);
					await db.write();
					await runCleanup();
				} else {
					job.status = 'error';
					console.error(`[cmd] job#${job.id} download FAILED url=${job.videoUrl}`);

					// Save as non-local so cron doesn't retry forever
					if (!db.data.videos.some((v) => v.id === videoId)) {
						db.data.videos.push({
							id: videoId,
							title: (info.title as string) ?? '',
							uploader: (info.uploader ?? info.channel ?? '') as string,
							upload_date: (info.upload_date ?? '') as string,
							duration: (info.duration ?? 0) as number,
							resolution: '',
							filesize_approx: null,
							thumbnail: (info.thumbnail ?? '') as string,
							webpage_url: (info.webpage_url ?? '') as string,
							description: '',
							downloaded_at: '',
							watch_progress: 0,
							last_watched_at: '',
							local: false,
							seen: true,
							channelId: (info.channel_id ?? '') as string
						});
						await db.write();
					}
				}
			} catch (e) {
				job.status = 'error';
				jobLog(job, `Warning: failed to save metadata: ${e}`);
			}

			markFinished(job);
			jobUpdate(job);
			processNext();
		});

		dlProc.on('error', (err) => {
			job.status = 'error';
			markFinished(job);
			console.error(`[cmd] job#${job.id} download spawn error:`, err.message);
			jobLog(job, err.message);
			jobUpdate(job);
			processNext();
		});
	});

	metaProc.on('error', (err) => {
		job.status = 'error';
		markFinished(job);
		console.error(`[cmd] job#${job.id} metadata spawn error:`, err.message);
		jobLog(job, err.message);
		jobUpdate(job);
		processNext();
	});
}
