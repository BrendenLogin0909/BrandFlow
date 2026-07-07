import { useEffect, useMemo, useState } from 'react';
import type { InternalDesignDocument, ValidationReport } from '@brandflow/design-schema';
import { validateDesignDocument, type ValidationContext } from '@brandflow/design-schema';

export interface ValidationPanelProps {
  document: InternalDesignDocument | null;
  validationContext?: Pick<ValidationContext, 'contrastMode'>;
  /** Increment to re-run validation immediately (e.g. on Save). */
  saveTrigger?: number;
  onSelectElement?: (elementId: string, pageId?: string) => void;
  className?: string;
  debounceMs?: number;
}

/**
 * Live validation sidebar — debounced client-side checks with element-anchored links.
 */
export function ValidationPanel({
  document: doc,
  validationContext,
  saveTrigger = 0,
  onSelectElement,
  className = '',
  debounceMs = 300,
}: ValidationPanelProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);

  const contextKey = useMemo(
    () => JSON.stringify(validationContext ?? {}),
    [validationContext],
  );

  useEffect(() => {
    if (!doc) {
      setReport(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setReport(validateDesignDocument(doc, validationContext));
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [doc, contextKey, debounceMs, validationContext]);

  useEffect(() => {
    if (!doc || saveTrigger === 0) return;
    setReport(validateDesignDocument(doc, validationContext));
  }, [saveTrigger, doc, validationContext]);

  if (!doc) {
    return (
      <div className={`rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-400 ${className}`}>
        Validation runs when a design is generated.
      </div>
    );
  }

  if (!report) {
    return (
      <div className={`rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 ${className}`}>
        Validating…
      </div>
    );
  }

  const blocking = report.errors.length;
  const advisory = report.warnings.length;

  return (
    <div
      className={`rounded border p-3 text-sm ${
        report.passed
          ? 'border-green-300 bg-green-50 text-green-900'
          : blocking > 0
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : 'border-yellow-200 bg-yellow-50 text-yellow-950'
      } ${className}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <strong>Validation</strong>
        <span className="text-xs opacity-80">
          {report.passed
            ? 'passed'
            : blocking > 0
              ? `${blocking} error${blocking === 1 ? '' : 's'}`
              : `${advisory} warning${advisory === 1 ? '' : 's'}`}
        </span>
      </div>
      <p className="mt-1 text-xs opacity-80">
        {report.passed
          ? 'On-brand, readable, inside safe areas.'
          : blocking > 0
            ? 'Fix errors before approval or export.'
            : 'Warnings only — export allowed if your brand uses warn mode.'}
      </p>

      {report.errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {report.errors.map((v, i) => (
            <ViolationRow key={`e-${i}`} violation={v} severity="error" onSelectElement={onSelectElement} />
          ))}
        </ul>
      )}
      {report.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-current/10 pt-2">
          {report.warnings.map((v, i) => (
            <ViolationRow key={`w-${i}`} violation={v} severity="warning" onSelectElement={onSelectElement} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ViolationRow({
  violation,
  severity,
  onSelectElement,
}: {
  violation: { ruleId: string; message: string; elementId?: string; pageId?: string };
  severity: 'error' | 'warning';
  onSelectElement?: (elementId: string, pageId?: string) => void;
}) {
  const icon = severity === 'error' ? '✕' : '⚠';
  const canSelect = Boolean(violation.elementId && onSelectElement);

  return (
    <li className="text-xs leading-snug">
      {canSelect ? (
        <button
          type="button"
          className="text-left underline decoration-dotted underline-offset-2 hover:opacity-80"
          onClick={() => onSelectElement!(violation.elementId!, violation.pageId)}
          title="Select element on canvas"
        >
          {icon} [{violation.ruleId}] {violation.message}
        </button>
      ) : (
        <span>
          {icon} [{violation.ruleId}] {violation.message}
        </span>
      )}
    </li>
  );
}
