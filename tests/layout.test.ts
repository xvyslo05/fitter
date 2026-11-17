import { describe, expect, it } from 'vitest';
import { orientation, orientationText, ticks } from '../src/ui/Layout';

describe('layout orientation against the pattern', () => {
  it('treats a pair copy and a fold flip as mirrors, and both together as a half turn', () => {
    expect(orientation(false, { angle: 0, flipY: false })).toEqual({ mirrored: false, turn: 0 });
    expect(orientation(true, { angle: 90, flipY: false })).toEqual({ mirrored: true, turn: 90 });
    expect(orientation(false, { angle: 0, flipY: true })).toEqual({ mirrored: true, turn: 180 });
    expect(orientation(true, { angle: 0, flipY: true })).toEqual({ mirrored: false, turn: 180 });
    expect(orientation(false, { angle: 270, flipY: false })).toEqual({ mirrored: false, turn: 270 });
  });
  it('says whether the piece is mirrored, turned, and what the second layer gives', () => {
    expect(orientationText({ mirrored: false, turn: 0 }, 'single')).toBe('Jako ve střihu');
    expect(orientationText({ mirrored: true, turn: 180 }, 'single')).toBe('Zrcadlově proti střihu, otočeno o 180°');
    expect(orientationText({ mirrored: false, turn: 90 }, 'folded')).toBe('Jako ve střihu, otočeno o 90° · spodní vrstva dá zrcadlový díl');
    expect(orientationText({ mirrored: true, turn: 180 }, 'fold')).toBe('Zrcadlově proti střihu, otočeno o 180° · na přehybu');
  });
});

describe('ruler marks', () => {
  it('tick every 10 cm, or every 5 in when the unit is inches', () => {
    expect(ticks(35, 'cm')).toEqual([0, 10, 20, 30].map(at => ({ at, label: String(at) })));
    expect(ticks(30, 'in').map(t => t.label)).toEqual(['0', '5', '10']);
    expect(ticks(30, 'in').map(t => t.at)).toEqual([0, 12.7, 25.4]);
    expect(ticks(25.4, 'in').map(t => t.label)).toEqual(['0', '5', '10']);
  });
});
