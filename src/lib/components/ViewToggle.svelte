<script lang="ts">
	interface Props {
		view: 'grid' | 'compact' | 'detailed';
		onchange: (view: 'grid' | 'compact' | 'detailed') => void;
	}

	let { view, onchange }: Props = $props();
</script>

<div class="filter">
	<input
		class="filter-reset btn btn-sm"
		type="radio"
		name="viewToggle"
		aria-label="Grid"
		checked={view === 'grid'}
		onchange={() => onchange('grid')}
	/>
	<input
		class="btn btn-sm"
		type="radio"
		name="viewToggle"
		aria-label="Compact"
		checked={view === 'compact'}
		onchange={() => onchange('compact')}
	/>
	<input
		class="btn btn-sm"
		type="radio"
		name="viewToggle"
		aria-label="Detailed"
		checked={view === 'detailed'}
		onchange={() => onchange('detailed')}
	/>
</div>
