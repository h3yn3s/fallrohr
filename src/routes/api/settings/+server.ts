import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';

export async function GET() {
	const db = await getDb();
	return json(db.data.settings);
}

export async function PATCH({ request }) {
	const db = await getDb();
	const body = await request.json();

	if (typeof body.keepUnwatched === 'number' && body.keepUnwatched >= 0) {
		db.data.settings.keepUnwatched = body.keepUnwatched;
	}
	if (typeof body.keepWatched === 'number' && body.keepWatched >= 0) {
		db.data.settings.keepWatched = body.keepWatched;
	}
	if (typeof body.maxResolution === 'number' && body.maxResolution > 0) {
		db.data.settings.maxResolution = body.maxResolution;
	}
	if (body.defaultView === 'grid' || body.defaultView === 'list') {
		db.data.settings.defaultView = body.defaultView;
	}
	if (typeof body.showExperimental === 'boolean') {
		db.data.settings.showExperimental = body.showExperimental;
	}

	await db.write();
	return json(db.data.settings);
}
