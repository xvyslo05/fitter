import { describe, expect, it } from 'vitest';
import { orientation, orientationText } from '../src/ui/Layout';

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
    expect(orientationText({ mirrored: true, turn: 180 }, 'fold')).toBe('Zrcadlově proti střihu, otočeno o 180° · na lomu');
  });
});
