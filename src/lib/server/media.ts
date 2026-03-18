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
