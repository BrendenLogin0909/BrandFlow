/** Result metadata from an external file import (SVG / PPTX). */
export interface ImportReport {
  format: 'svg' | 'pptx';
  matchedElements: number;
  unmatchedElements: number;
  warnings: string[];
  /** Features that could not be round-tripped as fully editable elements. */
  lostEditability: string[];
  /** PPTX import is beta — arbitrary decks are best-effort. */
  beta?: boolean;
}

export function emptyImportReport(format: ImportReport['format']): ImportReport {
  return {
    format,
    matchedElements: 0,
    unmatchedElements: 0,
    warnings: [],
    lostEditability: [],
    ...(format === 'pptx' ? { beta: true } : {}),
  };
}
