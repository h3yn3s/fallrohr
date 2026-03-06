<script lang="ts">
	type Status = 'idle' | 'scanning' | 'done' | 'error';

	let url = $state('');
	let limit = $state('');
	let status = $state<Status>('idle');
	let entries = $state<(Record<string, unknown> & { _seq: number })[]>([]);
	let errorMsg = $state('');
	let expandedSeqs = $state<Set<number>>(new Set());
	let seqCounter = 0;

	const sortedEntries = $derived(
		[...entries].sort((a, b) => {
			const da = typeof a.upload_date === 'string' ? a.upload_date : '';
			const db = typeof b.upload_date === 'string' ? b.upload_date : '';
			if (da && db) return db.localeCompare(da);
			if (da) return -1;
			if (db) return 1;
			return a._seq - b._seq;
		})
	);
	let eventSource: EventSource | null = null;

	function start() {
		if (!url.trim()) return;

		stop();
		entries = [];
		expandedSeqs = new Set();
		seqCounter = 0;
		errorMsg = '';
		status = 'scanning';

		const params = new URLSearchParams({ url: url.trim() });
		if (limit && parseInt(limit, 10) > 0) params.set('limit', limit);

		eventSource = new EventSource(`/api/experimental?${params}`);

		eventSource.addEventListener('entry', (e) => {
			try {
				entries = [...entries, { ...JSON.parse(e.data), _seq: ++seqCounter }];
			} catch {
				// skip malformed
			}
		});

		eventSource.addEventListener('done', () => {
			status = 'done';
			eventSource?.close();
			eventSource = null;
		});

		eventSource.addEventListener('error', (e) => {
			if (status === 'scanning' && eventSource?.readyState === EventSource.CLOSED) {
				status = 'error';
				errorMsg = 'Connection lost';
			} else if (e instanceof MessageEvent) {
				status = 'error';
				try {
					const data = JSON.parse(e.data);
					errorMsg = data.message ?? `yt-dlp exited with code ${data.code}`;
				} catch {
					errorMsg = 'Unknown error';
				}
			}
			eventSource?.close();
			eventSource = null;
		});
	}

	function stop() {
		eventSource?.close();
		eventSource = null;
		if (status === 'scanning') status = 'idle';
	}

	function toggleJson(seq: number) {
		const next = new Set(expandedSeqs);
		if (next.has(seq)) next.delete(seq);
		else next.add(seq);
		expandedSeqs = next;
	}

	function formatDuration(seconds: unknown): string {
		if (typeof seconds !== 'number' || !seconds) return '';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	function formatDate(d: unknown): string {
		if (typeof d !== 'string' || d.length !== 8) return String(d ?? '');
		return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:px-8">
	<h1 class="mb-6 text-2xl font-bold">Experimental: Channel Metadata Dump</h1>

	<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
		<label class="flex flex-1 flex-col gap-1">
			<span class="text-sm">Channel / Playlist URL</span>
			<input
				type="text"
				placeholder="https://www.youtube.com/@channel or playlist URL"
				class="input w-full input-primary"
				bind:value={url}
				onkeydown={(e) => e.key === 'Enter' && start()}
				disabled={status === 'scanning'}
			/>
		</label>
		<label class="flex w-24 flex-col gap-1">
			<span class="text-sm">Limit</span>
			<input
				type="number"
				placeholder="All"
				class="input-bordered input w-full"
				min="1"
				bind:value={limit}
				disabled={status === 'scanning'}
			/>
		</label>
		{#if status === 'scanning'}
			<button class="btn btn-error" onclick={stop}>Stop</button>
		{:else}
			<button class="btn btn-primary" onclick={start} disabled={!url.trim()}>Scan</button>
		{/if}
	</div>

	<!-- Status -->
	{#if status === 'scanning'}
		<div class="mb-4 flex items-center gap-2 text-sm">
			<span class="loading loading-sm loading-spinner"></span>
			Scanning... {entries.length} entries received
		</div>
	{:else if status === 'done'}
		<div class="mb-4 text-sm text-success">Done. {entries.length} entries total.</div>
	{:else if status === 'error'}
		<div class="mb-4 text-sm text-error">{errorMsg || 'An error occurred.'}</div>
	{/if}

	<!-- Results -->
	{#if entries.length > 0}
		<div class="flex flex-col gap-2">
			{#each sortedEntries as entry (entry._seq)}
				<div class="rounded-box bg-base-200 px-4 py-3">
					<div class="flex items-center justify-between gap-3">
						<span class="text-xs text-base-content/40 tabular-nums">{entry._seq}</span>
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium">
								{entry.title ?? 'Untitled'}
							</div>
							<div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-base-content/60">
								{#if entry.uploader || entry.channel}
									<span>{entry.uploader ?? entry.channel}</span>
								{/if}
								{#if entry.upload_date}
									<span>{formatDate(entry.upload_date)}</span>
								{/if}
								{#if entry.duration}
									<span>{formatDuration(entry.duration)}</span>
								{/if}
							</div>
						</div>
						<button class="btn btn-ghost btn-xs" onclick={() => toggleJson(entry._seq)}>
							{expandedSeqs.has(entry._seq) ? 'Hide JSON' : 'Show JSON'}
						</button>
					</div>
					{#if expandedSeqs.has(entry._seq)}
						<pre
							class="mt-2 max-h-96 overflow-auto rounded bg-base-300 p-3 text-xs">{JSON.stringify(
								entry,
								null,
								2
							)}</pre>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
