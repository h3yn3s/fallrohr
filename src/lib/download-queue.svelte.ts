export interface QueueJob {
	id: number;
	videoUrl?: string;
	videoId?: string;
	title?: string;
	status: string;
	progress: number;
}

let queue = $state<QueueJob[]>([]);

export function getQueue() {
	return queue;
}

export function setQueue(q: QueueJob[]) {
	queue = q;
}

export function updateJob(job: QueueJob) {
	queue = queue.map((j) => (j.id === job.id ? job : j));
}
