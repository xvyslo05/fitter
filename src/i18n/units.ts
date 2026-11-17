// Lengths are centimetres everywhere in the model; inches exist only at the edges (display and typing).
export type Unit = 'cm' | 'in';
export const CM_PER_INCH = 2.54;
export const toUnit = (cm: number, unit: Unit): number => unit === 'in' ? cm / CM_PER_INCH : cm;
export const fromUnit = (value: number, unit: Unit): number => unit === 'in' ? value * CM_PER_INCH : value;

// Typed length in `unit` to cm; NaN when the text is not a length. "12,5" and "12.5" are the same, and "5/8" and "1 1/2" are fractions
// (also "1-1/2"). Spaces, including the non-breaking ones the Czech thousands separator uses, are ignored inside a decimal number.
const FRACTION = /^(?:(\d+)[\s-]+)?(\d+)\s*\/\s*(\d+)$/;
export function parseLength(text: string, unit: Unit): number {
  const s = text.trim();
  const fraction = FRACTION.exec(s);
  if (fraction) {
    const whole = Number(fraction[1] ?? 0), numerator = Number(fraction[2]), denominator = Number(fraction[3]);
    return denominator === 0 ? NaN : fromUnit(whole + numerator / denominator, unit);
  }
  const plain = s.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return /^(?:\d+\.?\d*|\.\d+)$/.test(plain) ? fromUnit(Number(plain), unit) : NaN;
}
