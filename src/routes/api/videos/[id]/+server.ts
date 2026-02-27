import { json } from '@sveltejs/kit';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { getDb, DOWNLOAD_DIR } from '$lib/db';

export async function DELETE({ params }) {
	if (!/^[a-zA-Z0-9_-]+$/.test(params.id)) {
		return json({ error: 'Invalid id' }, { status: 400 });
	}

	const db = await getDb();
	const video = db.data.videos.find((v) => v.id === params.id);
	if (!video) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	// Remove video file, keep thumbnail and db entry
	try {
		unlinkSync(join(DOWNLOAD_DIR, `${params.id}.mp4`));
	} catch {
		// file may not exist
	}

	video.local = false;
	await db.write();

	return json({ ok: true });
}
