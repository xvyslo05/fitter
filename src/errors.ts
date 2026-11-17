// Messages of the model, geometry, nesting, PDF and storage code are codes with parameters, never text:
// workers and pure modules must not depend on UI wording. `describe()` in src/i18n turns a `Note` into text
// through the dictionary (`error.<code>`). A code is used for errors, for notes and for the sentences the
// model composes (buy summary, delete question), so one shape travels everywhere, also across a worker boundary.

// Codes whose text has one form per count: the dictionary holds `error.<code>.one/.few/.other` and `n` picks the form.
export const PLURAL_CODES = [
  'prepare.surplus', 'delete.withLines',
  'summary.tooWide', 'summary.tooWideFolded', 'summary.noFit', 'summary.placedAll', 'summary.pieces', 'summary.didNotFit',
] as const;

export const PLAIN_CODES = [
  // src/model/pattern.ts; the text starts with the path, composed from PATH_FIELDS or `piece` / `size` (see describe).
  'pattern.expectedObject', 'pattern.expectedText', 'pattern.reservedName', 'pattern.expectedNumber', 'pattern.expectedPositive',
  'pattern.expectedList', 'pattern.pointCoords', 'pattern.seamInvalid', 'pattern.outlineInvalid', 'pattern.sizeDimensions',
  'pattern.foldPoints', 'pattern.foldZero', 'pattern.foldEdge', 'pattern.format', 'pattern.duplicateSize', 'pattern.pieceSizes',
  'pattern.optionalFlag', 'pattern.copyCount', 'pattern.duplicateId', 'pattern.invalid',
  // src/model/prepare.ts
  'settings.seamRange', 'settings.gapRange', 'settings.resolutionRange', 'settings.timeRange', 'settings.seedNumber',
  'fabric.widthRange', 'fabric.lengthRange',
  'prepare.invalidSize', 'prepare.quantityRange', 'prepare.tooMany', 'prepare.patternMissing', 'prepare.foldAligned',
  'prepare.seamUnclear', 'prepare.foldNotVertical',
  'changed.seam', 'changed.gap', 'changed.rotationNone', 'changed.rotationCross', 'changed.mirrorOff', 'changed.precisionFine',
  'changed.precisionCoarse', 'changed.precisionCustom', 'changed.time', 'changed.seed',
  'delete.plain',
  // src/model/summary.ts
  'summary.computing', 'summary.buy', 'summary.buyFolded', 'summary.exact', 'summary.fits', 'summary.shrinkage', 'summary.placedPartial',
  // src/storage.ts
  'storage.corrupt', 'backup.unsupportedFormat', 'backup.noPatterns', 'backup.patternNamed', 'backup.patternNumbered', 'backup.workspace',
  // src/nest
  'nest.fabricRange', 'nest.optionsInvalid', 'nest.duplicateKeys', 'nest.tooManyPieces', 'nest.pieceInvalid', 'nest.foldNeedsFolded',
  'nest.orderInvalid', 'nest.orientInvalid', 'nest.failed',
  // src/geom
  'geom.empty', 'geom.splitOutline', 'geom.nothingSelected', 'geom.partsDisconnected', 'geom.partsHole', 'geom.foldZero', 'geom.foldAlign',
  'geom.seamNegative',
  // src/pdf
  'pdf.noPages', 'pdf.unknownPathOp', 'pdf.stepInvalid', 'pdf.noBlocks', 'pdf.pageRange', 'pdf.rowSum', 'pdf.pageReused',
  'pdf.traceSettings', 'pdf.badCoordinates', 'pdf.sheetTooLarge', 'pdf.traceFailed',
  'scale.squareSize', 'scale.percent', 'scale.squareMissing', 'scale.measured',
  'build.pieceGone', 'build.variantNoName', 'build.cellMissing', 'build.variantUnion', 'build.variantNoSizes',
  'rect.name', 'rect.material', 'rect.materialName', 'rect.count', 'rect.size',
  'hint.noMaterial', 'hint.sizesUnclear',
  // How detectLayout found the layout (listed in the UI).
  'source.samePaths', 'source.frame', 'source.pageSize', 'source.labels', 'source.seams', 'source.overview', 'source.manual',
  'unknown',
] as const;

export const ERROR_CODES = [...PLAIN_CODES, ...PLURAL_CODES] as const;
export type PlainCode = typeof PLAIN_CODES[number];
export type PluralCode = typeof PLURAL_CODES[number];
export type ErrorCode = PlainCode | PluralCode;

// Where a pattern error happened: the dictionary names the field (`error.path.<field>`) or composes "Díl {piece} / {size}".
export const PATH_FIELDS = ['pattern', 'sizes', 'size', 'pieces', 'patternId', 'patternName', 'seamAllowance', 'author', 'source', 'notes'] as const;
export type PathField = typeof PATH_FIELDS[number];

// A parameter is text, a number, or another note (a cause, or a phrase the text is built from).
export type ErrorParam = string | number | Note;
export type ErrorParams = Record<string, ErrorParam>;
export interface Note { code: ErrorCode; params?: ErrorParams }

export class AppError extends Error implements Note {
  readonly code: ErrorCode;
  readonly params: ErrorParams;
  // `message` is the code, so logs and `toThrow('code')` stay readable.
  constructor(code: ErrorCode, params: ErrorParams = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
  }
}

export const note = (code: ErrorCode, params?: ErrorParams): Note => params ? { code, params } : { code };
// A plain object (it survives postMessage); any exception that is not an AppError becomes `fallback`.
export const toNote = (e: unknown, fallback: ErrorCode = 'unknown'): Note =>
  e instanceof AppError ? note(e.code, Object.keys(e.params).length ? e.params : undefined) : { code: fallback };
