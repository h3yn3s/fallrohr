<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200 p-4">
	<div class="card w-full max-w-sm bg-base-100 shadow-xl">
		<div class="card-body">
			<h2 class="card-title justify-center text-2xl">fallrohr</h2>
			<p class="text-center text-sm text-base-content/60">Sign in to continue</p>

			{#if form?.error}
				<div role="alert" class="mt-2 alert alert-error">
					<span>{form.error}</span>
				</div>
			{/if}

			<form method="POST" action="?/login" use:enhance class="mt-4 flex flex-col gap-3">
				<label class="floating-label">
					<span>Username</span>
					<input
						type="text"
						name="username"
						placeholder="Username"
						class="input-bordered input w-full"
						value={form?.username ?? ''}
						autocomplete="username"
						required
					/>
				</label>

				<label class="floating-label">
					<span>Password</span>
					<input
						type="password"
						name="password"
						placeholder="Password"
						class="input-bordered input w-full"
						autocomplete="current-password"
						required
					/>
				</label>

				<button type="submit" class="btn mt-2 w-full btn-primary">Sign in</button>
			</form>
		</div>
	</div>
</div>
