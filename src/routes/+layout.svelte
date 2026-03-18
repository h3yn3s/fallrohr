<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { getQueue, setQueue, updateJob, type QueueJob } from '$lib/download-queue.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let { children, data } = $props();

	// --- SSE connection ---
	let es: EventSource | null = null;
	let reconnect: ReturnType<typeof setTimeout> | null = null;
	let alive = true;

	const MAX_LOG_LINES = 200;
	let jobLogs = $state<Record<number, string[]>>({});
	let logEls = $state<Record<number, HTMLPreElement>>({});
	let autoFollow = $state<Record<number, boolean>>({});
	let scrollRaf = 0;
	let downloadModal = $state<Modal>();
	let addModal = $state<Modal>();

	// --- Add video form ---
	let addTab = $state<'url' | 'upload'>('url');
	let addUrl = $state('');
	let addError = $state('');
	let addShowMeta = $state(false);
	let addMetaTitle = $state('');
	let addMetaUploader = $state('');
	let addMetaDate = $state(new Date().toISOString().slice(0, 10));

	// --- Upload form ---
	let uploadFile = $state<File | null>(null);
	let uploadTitle = $state('');
	let uploadUploader = $state('');
	let uploadDate = $state(new Date().toISOString().slice(0, 10));
	let uploadError = $state('');
	let uploadUploading = $state(false);

	async function addDownload() {
		if (!addUrl.trim()) return;
		addError = '';

		const params = new URLSearchParams({ url: addUrl.trim() });
		if (addShowMeta && addMetaTitle.trim()) params.set('title', addMetaTitle.trim());
		if (addShowMeta && addMetaUploader.trim()) params.set('uploader', addMetaUploader.trim());
		if (addShowMeta && addMetaDate.trim()) params.set('uploadDate', addMetaDate.trim());

		try {
			const res = await fetch(`/api/download?${params}`);
			if (!res.ok) {
				const body = await res.json();
				addError = body.error ?? 'Failed to queue download';
			} else {
				addUrl = '';
				addMetaTitle = '';
				addMetaUploader = '';
				addMetaDate = '';
				addModal?.close();
			}
		} catch {
			addError = 'Request failed';
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		uploadFile = file;
		if (file && !uploadTitle) {
			uploadTitle = file.name.replace(/\.mp4$/i, '');
		}
	}

	async function uploadVideo() {
		if (!uploadFile) return;
		uploadError = '';
		uploadUploading = true;

		const formData = new FormData();
		formData.append('file', uploadFile);
		formData.append('title', uploadTitle.trim());
		formData.append('uploader', uploadUploader.trim());
		formData.append('date', uploadDate.trim());

		try {
			const res = await fetch('/api/upload', { method: 'POST', body: formData });
			if (!res.ok) {
				const body = await res.json();
				uploadError = body.error ?? 'Upload failed';
			} else {
				uploadFile = null;
				uploadTitle = '';
				uploadUploader = '';
				uploadDate = new Date().toISOString().slice(0, 10);
				addModal?.close();
			}
		} catch {
			uploadError = 'Request failed';
		} finally {
			uploadUploading = false;
		}
	}

	function connectSSE() {
		if (es || !alive) return;
		es = new EventSource('/api/download');
		es.addEventListener('queue', (e) => setQueue(JSON.parse(e.data)));
		es.addEventListener('update', (e) => updateJob(JSON.parse(e.data)));
		es.addEventListener('log', (e) => {
			const { id, lines } = JSON.parse(e.data);
			const existing = jobLogs[id] ?? [];
			const combined = existing.concat(lines);
			jobLogs[id] = combined.length > MAX_LOG_LINES ? combined.slice(-MAX_LOG_LINES) : combined;
		});
		es.addEventListener('error', () => {
			es?.close();
			es = null;
			if (alive) reconnect = setTimeout(connectSSE, 3000);
		});
	}

	const isLoginPage = $derived(page.url.pathname === '/login');

	onMount(() => {
		if (data.authenticated) connectSSE();
		if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
		return () => {
			alive = false;
			if (reconnect) clearTimeout(reconnect);
			es?.close();
			es = null;
		};
	});

	// --- Auto-scroll logs ---
	function handleLogScroll(jobId: number) {
		const el = logEls[jobId];
		if (!el) return;
		autoFollow[jobId] = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
	}

	$effect(() => {
		const _trigger = jobLogs;
		if (scrollRaf) cancelAnimationFrame(scrollRaf);
		scrollRaf = requestAnimationFrame(() => {
			for (const [id, el] of Object.entries(logEls)) {
				if (autoFollow[Number(id)] !== false && el) el.scrollTop = el.scrollHeight;
			}
		});
	});

	// --- Download queue ---
	const queue = $derived(getQueue());
	const activeJobs = $derived(
		queue.filter(
			(j) => j.status === 'queued' || j.status === 'metadata' || j.status === 'downloading'
		)
	);
	const hasActive = $derived(activeJobs.length > 0);
	const hasError = $derived(queue.some((j) => j.status === 'error'));
	const visibleJobs = $derived(
		queue.filter((j) => j.status !== 'done' && j.status !== 'cancelled')
	);

	async function cancelJob(jobId: number) {
		const wasLast = activeJobs.length === 1 && activeJobs[0].id === jobId;
		await fetch(`/api/download?id=${jobId}`, { method: 'DELETE' });
		if (wasLast) downloadModal?.close();
	}

	async function cancelAll() {
		await fetch('/api/download', { method: 'DELETE' });
		downloadModal?.close();
	}

	function statusLabel(status: string) {
		const labels: Record<string, string> = {
			queued: 'Queued',
			metadata: 'Fetching info...',
			downloading: 'Downloading',
			done: 'Complete',
			error: 'Failed',
			cancelled: 'Cancelled'
		};
		return labels[status] ?? status;
	}

	// --- Navigation ---
	const navItems = $derived([
		{ href: '/', label: 'Home' },
		{ href: '/channels', label: 'Channels' },
		{ href: '/library', label: 'Library' },
		{ href: '/subscriptions', label: 'Subscriptions' },
		...(data.showExperimental ? [{ href: '/experimental', label: 'Experimental' }] : []),
		{ href: '/settings', label: 'Settings' }
	]);

	function isActive(href: string) {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}
</script>

<svelte:head><title>fallrohr</title><link rel="icon" href={favicon} /></svelte:head>

{#if isLoginPage}
	{@render children()}
{:else}
	<div class="bg-base-200">
		<div class="navbar mx-auto max-w-5xl px-4 sm:px-8">
			<div class="navbar-start">
				<!-- Burger dropdown (small screens) -->
				<div class="dropdown sm:hidden">
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div tabindex="0" role="button" class="btn btn-ghost btn-sm">
						<svg
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
							/>
						</svg>
					</div>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<ul
						tabindex="0"
						class="dropdown-content menu z-10 mt-2 w-52 rounded-box bg-base-100 p-2 shadow"
					>
						{#each navItems as item}
							<li>
								<a href={item.href} class:active={isActive(item.href)}>{item.label}</a>
							</li>
						{/each}
						{#if data.authEnabled}
							<li>
								<form method="POST" action="/login?/logout">
									<button type="submit" class="w-full text-left">Logout</button>
								</form>
							</li>
						{/if}
					</ul>
				</div>
				<a href="/" class="text-lg font-bold">fallrohr</a>
			</div>
			<div class="navbar-center hidden sm:flex">
				<div class="flex gap-1">
					{#each navItems as item}
						<a href={item.href} class="btn btn-ghost btn-sm" class:btn-active={isActive(item.href)}>
							{item.label}
						</a>
					{/each}
				</div>
			</div>
			<div class="navbar-end gap-2">
				<div class="indicator mr-2">
					{#if hasActive || hasError}
						<span
							class="indicator-item badge animate-pulse badge-xs"
							class:badge-error={hasError}
							class:badge-info={!hasError}>{visibleJobs.length}</span
						>
					{/if}
					<button class="btn btn-square btn-ghost btn-sm" onclick={() => downloadModal?.open()}>
						<svg
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
							/>
						</svg>
					</button>
				</div>
				<button
					class="btn btn-square btn-sm btn-primary"
					onclick={() => addModal?.open()}
					aria-label="Add video"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						viewBox="0 0 24 24"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
					>
				</button>
				{#if data.authEnabled}
					<form method="POST" action="/login?/logout" class="hidden sm:block">
						<button type="submit" class="btn btn-ghost btn-sm">Logout</button>
					</form>
				{/if}
			</div>
		</div>
	</div>

	{@render children()}

	<Modal bind:this={downloadModal} boxClass="flex max-h-[80vh] max-w-2xl flex-col gap-2">
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-bold">Downloads</h3>
			{#if activeJobs.length > 1}
				<button class="btn text-error btn-ghost btn-xs" onclick={cancelAll}>Cancel all</button>
			{/if}
		</div>

		{#if visibleJobs.length === 0}
			<p class="py-4 text-center text-sm text-base-content/50">No active downloads.</p>
		{/if}

		{#each visibleJobs as job (job.id)}
			<div class="rounded-box bg-base-200">
				<div class="flex items-center gap-3 px-4 py-3">
					<div class="min-w-0 flex-1">
						<div class="truncate text-sm font-medium">
							{job.title ?? job.videoUrl}
						</div>
						<div class="text-xs text-base-content/60">
							{statusLabel(job.status)}
							{#if job.status === 'downloading'}
								— {job.progress.toFixed(0)}%
							{/if}
						</div>
					</div>
					{#if job.status === 'queued'}
						<span class="badge badge-ghost badge-sm">Queued</span>
					{:else if job.status === 'metadata' || job.status === 'downloading'}
						<span class="loading loading-xs loading-spinner"></span>
					{:else if job.status === 'error'}
						<span class="badge badge-sm badge-error">Error</span>
					{/if}
					{#if job.status !== 'done' && job.status !== 'cancelled'}
						<button class="btn text-error btn-ghost btn-xs" onclick={() => cancelJob(job.id)}>
							✕
						</button>
					{/if}
				</div>
				{#if job.status === 'downloading' || job.status === 'metadata'}
					<div class="px-4 pb-3">
						<progress class="progress progress-primary" value={job.progress} max="100"></progress>
					</div>
				{/if}
				{#if jobLogs[job.id]?.length}
					<div class="relative">
						<pre
							bind:this={logEls[job.id]}
							onscroll={() => handleLogScroll(job.id)}
							class="max-h-40 overflow-y-auto px-4 pb-3 text-xs whitespace-pre-wrap">{jobLogs[
								job.id
							].join('\n')}</pre>
						{#if autoFollow[job.id] === false}
							<button
								class="btn absolute right-2 bottom-2 opacity-70 btn-ghost btn-xs"
								onclick={() => {
									autoFollow[job.id] = true;
									logEls[job.id]?.scrollTo(0, logEls[job.id].scrollHeight);
								}}
							>
								↓ Follow
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</Modal>

	<Modal bind:this={addModal} boxClass="flex max-w-lg flex-col gap-4">
		<h3 class="text-lg font-bold">Add video</h3>

		<div role="tablist" class="tabs-bordered tabs">
			<button
				role="tab"
				class="tab"
				class:tab-active={addTab === 'url'}
				onclick={() => (addTab = 'url')}>URL</button
			>
			<button
				role="tab"
				class="tab"
				class:tab-active={addTab === 'upload'}
				onclick={() => (addTab = 'upload')}>Upload</button
			>
		</div>

		{#if addTab === 'url'}
			<div class="flex gap-2">
				<input
					type="text"
					placeholder="Video URL (YouTube, Vimeo, etc.)"
					class="input grow input-primary"
					bind:value={addUrl}
					onkeydown={(e) => e.key === 'Enter' && addDownload()}
				/>
				<button class="btn btn-primary" onclick={addDownload}>Download</button>
			</div>

			<label class="flex cursor-pointer items-center gap-2">
				<input type="checkbox" class="checkbox checkbox-sm" bind:checked={addShowMeta} />
				<span class="text-sm text-base-content/60">Override metadata</span>
			</label>

			{#if addShowMeta}
				<div class="flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100 p-4">
					<p class="text-xs text-base-content/50">
						Optional. yt-dlp will extract metadata automatically — these fields override what it
						finds.
					</p>
					<label class="flex flex-col gap-1">
						<span class="text-sm">Title</span>
						<input
							type="text"
							placeholder="Video title"
							class="input input-sm"
							bind:value={addMetaTitle}
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-sm">Uploader</span>
						<input
							type="text"
							placeholder="Channel or uploader name"
							class="input input-sm"
							bind:value={addMetaUploader}
						/>
					</label>
					<label class="flex flex-col gap-1">
						<span class="text-sm">Upload date</span>
						<input type="date" class="input input-sm" bind:value={addMetaDate} />
					</label>
				</div>
			{/if}

			{#if addError}
				<div role="alert" class="alert alert-error">{addError}</div>
			{/if}

			<p class="text-sm text-base-content/50">
				Paste any URL supported by yt-dlp. The video will be added to the download queue.
			</p>
		{:else}
			<label class="flex flex-col gap-1">
				<span class="text-sm">Video file</span>
				<input
					type="file"
					accept=".mp4,video/mp4"
					class="file-input file-input-primary"
					onchange={handleFileSelect}
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm">Title</span>
				<input
					type="text"
					placeholder="Video title"
					class="input input-sm"
					bind:value={uploadTitle}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm">Channel / Uploader</span>
				<input
					type="text"
					placeholder="Channel or uploader name"
					class="input input-sm"
					bind:value={uploadUploader}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm">Date</span>
				<input type="date" class="input input-sm" bind:value={uploadDate} />
			</label>

			<button
				class="btn btn-primary"
				onclick={uploadVideo}
				disabled={!uploadFile || uploadUploading}
			>
				{#if uploadUploading}
					<span class="loading loading-sm loading-spinner"></span>
					Uploading...
				{:else}
					Upload
				{/if}
			</button>

			{#if uploadError}
				<div role="alert" class="alert alert-error">{uploadError}</div>
			{/if}
		{/if}
	</Modal>
{/if}
