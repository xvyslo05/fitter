import { toNote } from '../errors';
import { suggestAssignments, traceSizes } from './trace';
import type { SuggestRequest, TraceRequest, TraceResponse } from './types';

self.onmessage = (event: MessageEvent<TraceRequest | SuggestRequest>) => {
  let response: TraceResponse;
  const data = event.data;
  try { response = 'suggest' in data ? { suggestion: suggestAssignments(data.paths, data.texts, data.scale) } : { result: traceSizes(data) }; }
  catch (e) { response = { error: toNote(e, 'pdf.traceFailed') }; }
  self.postMessage(response);
};
