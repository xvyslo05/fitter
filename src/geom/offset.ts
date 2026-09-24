import { ClipperOffset, EndType, JoinType, Paths64 } from 'clipper2-js';
import type { IPoint64 } from 'clipper2-js';

interface OffsetGroup { outPath: IPoint64[]; outPaths: IPoint64[][] }
interface OffsetAdapter {
  offsetPolygon: (group: OffsetGroup, path: IPoint64[]) => void;
  offsetPoint: (group: OffsetGroup, path: IPoint64[], current: number, previous: number) => void;
}

export function inflatePaths(paths: Paths64, delta: number): Paths64 {
  if (delta < 0) throw new Error('Švová záložka nesmí být záporná.');
  const engine = new ClipperOffset(2);
  // clipper2-js 1.2.4 passes the previous index by value and never updates it
  // in offsetPolygon. Adapt this instance only; keep its joins and union cleanup.
  // The square, concave-gap and diamond tests guard these compatibility fixes.
  // offsetPoint also overwrites cosA when sinA rounds outside [-1, 1].
  const crossProduct = engine.crossProduct.bind(engine);
  engine.crossProduct = (a, b) => Math.max(-1, Math.min(1, crossProduct(a, b)));
  const adapter = engine as unknown as OffsetAdapter;
  adapter.offsetPolygon = (group, path) => {
    group.outPath = [];
    for (let i = 0; i < path.length; i++) adapter.offsetPoint(group, path, i, (i + path.length - 1) % path.length);
    group.outPaths.push(group.outPath);
  };
  engine.addPaths(paths, JoinType.Miter, EndType.Polygon);
  const result = new Paths64();
  engine.execute(delta, result);
  return result;
}
