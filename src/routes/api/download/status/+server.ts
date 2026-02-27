import { json } from '@sveltejs/kit';
import { getQueue } from '$lib/server/downloads';

export function GET() {
	return json(getQueue());
}
