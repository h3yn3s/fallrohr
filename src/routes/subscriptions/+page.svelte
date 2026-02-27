<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();
	let url = $state('');
	let loading = $state(false);
	let error = $state('');
	let filter = $state('');

	function timeAgo(iso: string) {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}

	async function subscribe() {
		if (!url.trim()) return;
		loading = true;
		error = '';

		try {
			const res = await fetch('/api/subscriptions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: url.trim() })
			});
			const body = await res.json();

			if (!res.ok) {
				error = body.error ?? 'Failed to subscribe';
			} else {
				url = '';
				await invalidateAll();
			}
		} catch {
			error = 'Request failed';
		} finally {
			loading = false;
		}
	}

	async function unsubscribe(channelId: string) {
		await fetch(`/api/subscriptions/${channelId}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function toggleAutoDownload(channelId: string, enabled: boolean) {
		await fetch(`/api/subscriptions/${channelId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ autoDownload: enabled })
		});
		await invalidateAll();
	}

	let checking = $state(false);

	async function checkNow() {
		checking = true;
		try {
			await fetch('/api/feeds/check', { method: 'POST' });
			await invalidateAll();
		} finally {
			checking = false;
		}
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
	<h1 class="text-2xl font-bold">Subscriptions</h1>

	<div class="flex gap-2">
		<input
			type="text"
			placeholder="YouTube channel URL"
			class="input grow input-primary"
			bind:value={url}
			onkeydown={(e) => e.key === 'Enter' && subscribe()}
			disabled={loading}
		/>
		<button class="btn btn-primary" onclick={subscribe} disabled={loading}>
			{#if loading}
				<span class="loading loading-sm loading-spinner"></span>
			{/if}
			Subscribe
		</button>
	</div>

	{#if error}
		<div role="alert" class="alert alert-error">{error}</div>
	{/if}

	{#await data.subs}
		<div class="flex flex-col gap-2">
			{#each Array(3) as _}
				<div class="flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
					<div class="flex flex-col gap-1">
						<div class="h-5 w-40 skeleton"></div>
						<div class="h-3 w-56 skeleton"></div>
					</div>
					<div class="flex items-center gap-3">
						<div class="h-5 w-16 skeleton"></div>
						<div class="h-8 w-24 skeleton"></div>
					</div>
				</div>
			{/each}
		</div>
	{:then subs}
		{@const filtered = filter.trim()
			? subs.subscriptions.filter((s) => s.channelName.toLowerCase().includes(filter.toLowerCase()))
			: subs.subscriptions}

		{#if subs.subscriptions.length === 0}
			<p class="text-center text-base-content/50">No subscriptions yet.</p>
		{:else}
			<input
				type="text"
				placeholder="Filter subscriptions..."
				class="input input-sm w-full"
				bind:value={filter}
			/>

			<div class="flex flex-col gap-2">
				{#each filtered as sub}
					<div class="flex items-center justify-between gap-3 rounded-lg bg-base-200 px-4 py-3">
						<div class="flex min-w-0 flex-col">
							<a href="/channels/{sub.channelId}" class="link truncate font-medium link-hover">
								{sub.channelName}
							</a>
							<a
								href="https://www.youtube.com/channel/{sub.channelId}"
								target="_blank"
								class="truncate text-xs text-base-content/50 hover:underline"
							>
								youtube.com/channel/{sub.channelId}
							</a>
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<div
								class="tooltip tooltip-left"
								data-tip="Checks the RSS feed hourly and auto-downloads new videos published after you subscribed. Existing videos are not queued to avoid flooding downloads."
							>
								<label class="flex items-center gap-2 text-xs">
									<input
										type="checkbox"
										class="toggle toggle-primary toggle-sm"
										checked={sub.autoDownload ?? false}
										onchange={(e) => toggleAutoDownload(sub.channelId, e.currentTarget.checked)}
									/>
									Auto
								</label>
							</div>
							<button
								class="btn btn-square text-error btn-ghost btn-sm"
								onclick={() => unsubscribe(sub.channelId)}
								aria-label="Unsubscribe from {sub.channelName}"
							>
								<svg
									class="h-4 w-4"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M6 18 18 6M6 6l12 12"
									/></svg
								>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="divider"></div>

		<div class="flex items-center justify-between">
			<h2 class="text-lg font-bold">Auto-download</h2>
			<button class="btn btn-sm btn-primary" onclick={checkNow} disabled={checking}>
				{#if checking}
					<span class="loading loading-xs loading-spinner"></span>
				{/if}
				Check now
			</button>
		</div>
		<p class="text-sm text-base-content/60">
			Checks feeds hourly for channels with Auto enabled. You can also trigger it manually.
		</p>

		{#if subs.cronLog.length > 0}
			<div class="flex flex-col gap-1">
				{#each subs.cronLog as entry}
					<div class="flex flex-col gap-1 rounded-lg bg-base-200 px-4 py-2 text-xs">
						<div class="flex items-center gap-3">
							<span class="w-16 shrink-0 text-base-content/50">{timeAgo(entry.timestamp)}</span>
							<span class="badge badge-ghost badge-xs">{entry.trigger}</span>
							<span class="text-base-content/70">
								{entry.channels} channel{entry.channels !== 1 ? 's' : ''} checked
							</span>
							{#if entry.queued > 0}
								<span class="badge badge-sm badge-success">+{entry.queued} queued</span>
							{:else if !entry.error}
								<span class="text-base-content/40">no new videos</span>
							{/if}
							{#if entry.error}
								<span class="badge badge-sm badge-error">error</span>
							{/if}
						</div>
						{#if entry.channelResults?.length > 0}
							<div class="ml-[4.75rem] flex flex-wrap gap-1">
								{#each entry.channelResults as cr}
									<span class="badge badge-outline badge-sm">{cr.channelName} +{cr.queued}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-base-content/40">No feed checks yet.</p>
		{/if}

		{#if subs.cronLogAggregated.length > 0}
			<div class="divider text-xs text-base-content/40">History</div>
			<div class="flex flex-col gap-1">
				{#each subs.cronLogAggregated as agg}
					<div class="flex flex-col gap-1 rounded-lg bg-base-200 px-4 py-2 text-xs">
						<div class="flex items-center gap-3">
							<span class="w-16 shrink-0 text-base-content/50">{agg.period}</span>
							<span class="badge badge-ghost badge-xs">{agg.type}</span>
							<span class="text-base-content/70">
								{agg.runs} run{agg.runs !== 1 ? 's' : ''}
							</span>
							{#if agg.queued > 0}
								<span class="badge badge-sm badge-success">+{agg.queued} queued</span>
							{:else}
								<span class="text-base-content/40">no new videos</span>
							{/if}
							{#if agg.errors > 0}
								<span class="badge badge-sm badge-error"
									>{agg.errors} error{agg.errors !== 1 ? 's' : ''}</span
								>
							{/if}
						</div>
						{#if agg.channelResults.length > 0}
							<div class="ml-[4.75rem] flex flex-wrap gap-1">
								{#each agg.channelResults as cr}
									<span class="badge badge-outline badge-sm">{cr.channelName} +{cr.queued}</span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/await}
</div>
