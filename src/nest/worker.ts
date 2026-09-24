import { nest } from './nest';
import type { WorkerRequest, WorkerResponse } from './types';

const send = (message: WorkerResponse) => self.postMessage(message);
self.onmessage = ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    for (const job of data.jobs) {
      const result = nest(job.pieces, job.fabric, data.options,
        best => send({ type: 'progress', material: job.material, result: best }));
      send({ type: 'result', material: job.material, result });
    }
    send({ type: 'done' });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'Výpočet se nezdařil.' });
  }
};
