import type { Pt } from '../model/pattern';

export type Rotation = 'none' | '180' | '90';
export interface NestPiece {
  key: string;
  label: string;
  polygon: Pt[];
  rotation: Rotation;
  foldEdge?: boolean;
}
export interface Fabric { width: number; length: number | null; folded: boolean }
export interface NestOptions { gap: number; resolution: number; timeMs: number; seed: number }
export interface Placement {
  key: string;
  x: number;
  y: number;
  angle: 0 | 90 | 180 | 270;
  flipY: boolean;
  polygon: Pt[];
}
export interface NestResult {
  placements: Placement[];
  unplaced: string[];
  usedLength: number;
  utilization: number;
  iterations: number;
}
export interface NestJob { material: string; pieces: NestPiece[]; fabric: Fabric }
export type WorkerRequest = { jobs: NestJob[]; options: NestOptions };
export type WorkerResponse =
  | { type: 'progress' | 'result'; material: string; result: NestResult }
  | { type: 'done' }
  | { type: 'error'; message: string };
