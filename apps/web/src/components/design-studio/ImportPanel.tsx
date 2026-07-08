import { useRef, useState } from 'react';
import type { InternalDesignDocument, ValidationReport } from '@brandflow/design-schema';
import { parseDesignDocument } from '@brandflow/design-schema';
import { getAccessToken, getActiveClientId } from '../../lib/api';

interface ImportReport {
  format: 'svg' | 'pptx';
  matchedElements: number;
  unmatchedElements: number;
  warnings: string[];
  lostEditability: string[];
  beta?: boolean;
}

interface ImportPreviewResponse {
  document: InternalDesignDocument;
  importReport: ImportReport;
  validationReport: ValidationReport;
}

interface ApplyResponse {
  version: number;
  validationReport: ValidationReport;
}

export interface ImportPanelProps {
  document: InternalDesignDocument;
  designDocumentId: string | null;
  onApply: (doc: InternalDesignDocument) => void;
  className?: string;
}

/**
 * Upload SVG or PPTX edited externally, preview ImportReport, then Accept/Reject.
 */
export function ImportPanel({
  document: doc,
  designDocumentId,
  onApply,
  className = '',
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBase, setPreviewBase] = useState<InternalDesignDocument | null>(null);
  const [previewNext, setPreviewNext] = useState<InternalDesignDocument | null>(null);
  const [previewReport, setPreviewReport] = useState<ImportReport | null>(null);
  const [previewValidation, setPreviewValidation] = useState<ValidationReport | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  async function uploadFile(file: File) {
    if (!designDocumentId) {
      setError('Save your design first (linked to a post package) to enable import.');
      return;
    }
    const clientId = getActiveClientId();
    const token = getAccessToken();
    if (!clientId || !token) {
      setError('Sign in and select a client.');
      return;
    }

    setBusy(true);
    setError(null);
    setPreviewBase(null);
    setPreviewNext(null);
    setPreviewReport(null);
    setPreviewValidation(null);
    setFileLabel(file.name);

    const baseSnapshot = doc;
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch(`/api/clients/${clientId}/design-documents/${designDocumentId}/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Import failed (${res.status})`);
      }
      const data = (await res.json()) as ImportPreviewResponse;
      setPreviewBase(baseSnapshot);
      setPreviewNext(parseDesignDocument(data.document));
      setPreviewReport(data.importReport);
      setPreviewValidation(data.validationReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFileLabel(null);
    } finally {
      setBusy(false);
    }
  }

  async function acceptPreview() {
    if (!previewNext || !designDocumentId) return;
    setBusy(true);
    setError(null);
    try {
      const clientId = getActiveClientId();
      const token = getAccessToken();
      if (!clientId || !token) throw new Error('Not signed in');

      const res = await fetch(
        `/api/clients/${clientId}/design-documents/${designDocumentId}/import/apply`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ document: previewNext }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Apply failed (${res.status})`);
      }
      const data = (await res.json()) as ApplyResponse;
      const applied = { ...previewNext, version: data.version };
      onApply(applied);
      clearPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearPreview() {
    setPreviewBase(null);
    setPreviewNext(null);
    setPreviewReport(null);
    setPreviewValidation(null);
    setFileLabel(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function rejectPreview() {
    clearPreview();
    setError(null);
  }

  return (
    <fieldset className={`rounded border border-teal-200 bg-teal-50/40 p-3 ${className}`}>
      <legend className="px-1 text-xs font-semibold uppercase text-teal-700">Import external edit</legend>

      {!designDocumentId && (
        <p className="mb-2 text-xs text-teal-800">
          Save your design while linked to a post package — import merges against the authoritative document.
        </p>
      )}

      <p className="mb-2 text-xs text-slate-600">
        Re-import an SVG (Figma/Inkscape) or PPTX (PowerPoint) you exported from BrandFlow and edited externally.
      </p>

      {!previewNext ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".svg,.pptx,image/svg+xml,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="mb-2 block w-full text-xs"
            disabled={busy || !designDocumentId}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
          <button
            type="button"
            className="w-full rounded-md border border-teal-400 bg-white py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-50"
            disabled={busy || !designDocumentId}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? 'Parsing…' : 'Choose SVG or PPTX'}
          </button>
        </>
      ) : (
        <div className="space-y-2 rounded border border-teal-300 bg-white p-2 text-sm">
          {fileLabel && (
            <p className="text-xs font-medium text-teal-800">{fileLabel}</p>
          )}
          {previewReport?.beta && (
            <p className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
              Beta: PPTX import is best-effort — complex charts and animations may not round-trip.
            </p>
          )}
          <p className="text-xs text-slate-700">
            Matched <strong>{previewReport?.matchedElements ?? 0}</strong> elements
            {previewReport && previewReport.unmatchedElements > 0 && (
              <span> · {previewReport.unmatchedElements} skipped</span>
            )}
          </p>
          {previewReport?.lostEditability?.length ? (
            <ul className="max-h-20 overflow-auto text-xs text-amber-700">
              {previewReport.lostEditability.slice(0, 5).map((line) => (
                <li key={line}>• {line}</li>
              ))}
              {previewReport.lostEditability.length > 5 && (
                <li>…and {previewReport.lostEditability.length - 5} more</li>
              )}
            </ul>
          ) : null}
          {previewReport?.warnings?.length ? (
            <ul className="max-h-20 overflow-auto text-xs text-slate-500">
              {previewReport.warnings.slice(0, 4).map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          ) : null}
          {previewValidation?.errors?.length ? (
            <p className="text-xs font-medium text-amber-700">
              {previewValidation.errors.length} validation issue(s) — review before approving the post.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-md bg-teal-600 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              disabled={busy}
              onClick={acceptPreview}
            >
              Accept import
            </button>
            <button
              type="button"
              className="flex-1 rounded-md border border-slate-300 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
              disabled={busy}
              onClick={rejectPreview}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}
