import { toNote } from '../errors';
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
    // Plain fields only: an Error instance would lose its code and params in the structured clone.
    send({ type: 'error', ...toNote(error, 'nest.failed') });
  }
};
