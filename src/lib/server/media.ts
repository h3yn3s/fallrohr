import { execFile } from 'child_process';

export function generateThumbnail(videoPath: string, thumbPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(
			'ffmpeg',
			['-y', '-ss', '5', '-i', videoPath, '-frames:v', '1', '-q:v', '2', thumbPath],
			{ timeout: 15000 },
			(err) => (err ? reject(err) : resolve())
		);
	});
}

export function probeResolution(videoPath: string): Promise<string> {
	return new Promise((resolve) => {
		execFile(
			'ffprobe',
			[
				'-v',
				'error',
				'-select_streams',
				'v:0',
				'-show_entries',
				'stream=width,height',
				'-of',
				'csv=p=0',
				videoPath
			],
			{ timeout: 10000 },
			(err, stdout) => {
				if (err || !stdout.trim()) return resolve('');
				const [w, h] = stdout.trim().split(',');
				resolve(w && h ? `${w}x${h}` : '');
			}
		);
	});
}

export function probeDuration(videoPath: string): Promise<number> {
	return new Promise((resolve) => {
		execFile(
			'ffprobe',
			['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath],
			{ timeout: 10000 },
			(err, stdout) => {
				if (err || !stdout.trim()) return resolve(0);
				const dur = parseFloat(stdout.trim());
				resolve(isNaN(dur) ? 0 : Math.round(dur));
			}
		);
	});
}

export function probeAudioCodec(videoPath: string): Promise<string> {
	return new Promise((resolve) => {
		execFile(
			'ffprobe',
			[
				'-v',
				'error',
				'-select_streams',
				'a:0',
				'-show_entries',
				'stream=codec_name',
				'-of',
				'csv=p=0',
				videoPath
			],
			{ timeout: 10000 },
			(err, stdout) => {
				if (err) return resolve('');
				resolve(stdout.trim());
			}
		);
	});
}

// Extract audio track from a video to an .m4a file.
// Stream-copies when the source codec is already AAC/ALAC (container-compatible),
// otherwise re-encodes to AAC at `bitrateKbps`. -movflags +faststart enables progressive playback.
export async function extractAudio(
	videoPath: string,
	audioPath: string,
	bitrateKbps = 192
): Promise<void> {
	const codec = await probeAudioCodec(videoPath);
	const canCopy = codec === 'aac' || codec === 'alac';
	const args = canCopy
		? ['-y', '-i', videoPath, '-vn', '-c:a', 'copy', '-movflags', '+faststart', audioPath]
		: [
				'-y',
				'-i',
				videoPath,
				'-vn',
				'-c:a',
				'aac',
				'-b:a',
				`${bitrateKbps}k`,
				'-movflags',
				'+faststart',
				audioPath
			];
	return new Promise((resolve, reject) => {
		execFile('ffmpeg', args, { timeout: 300000 }, (err) => (err ? reject(err) : resolve()));
	});
}
