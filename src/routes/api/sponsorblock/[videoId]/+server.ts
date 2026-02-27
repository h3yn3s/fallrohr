export async function GET({ params }) {
	const res = await fetch(
		`https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(params.videoId)}`
	);
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' }
	});
}
