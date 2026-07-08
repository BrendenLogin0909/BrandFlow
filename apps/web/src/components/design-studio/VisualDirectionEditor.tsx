import type { VisualDirection } from '@brandflow/shared';

const FIELDS: { key: keyof VisualDirection; label: string; placeholder: string; rows?: number }[] = [
  { key: 'scene', label: 'Scene', placeholder: 'What is depicted — characters, objects, setting' },
  { key: 'metaphor', label: 'Metaphor', placeholder: 'Central visual metaphor tying copy to image' },
  { key: 'mood', label: 'Mood', placeholder: 'Bold, calm, urgent, playful…' },
  { key: 'compositionHints', label: 'Composition', placeholder: 'Two-tone headline, hero left, badge top-right…', rows: 2 },
  { key: 'colourMood', label: 'Colour mood', placeholder: 'Primary headline, accent highlights, dark band…' },
  { key: 'illustrationStyle', label: 'Illustration style', placeholder: 'Flat vector, minimal icons, chart-forward…' },
];

export interface VisualDirectionEditorProps {
  value: VisualDirection;
  onChange: (next: VisualDirection) => void;
  className?: string;
}

/** Collapsible visual-direction fields for draft storyboard / edit modals (Agent 9). */
export function VisualDirectionEditor({ value, onChange, className = '' }: VisualDirectionEditorProps) {
  return (
    <details className={`rounded border border-indigo-200 bg-indigo-50/30 p-3 ${className}`} open>
      <summary className="cursor-pointer text-sm font-semibold text-indigo-800">
        Visual direction
        <span className="ml-2 text-xs font-normal text-indigo-600">
          feeds compose + AI edit
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs">
            <span className="font-semibold text-slate-700">{f.label}</span>
            {f.rows && f.rows > 1 ? (
              <textarea
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                rows={f.rows}
                placeholder={f.placeholder}
                value={value[f.key] ?? ''}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value || undefined })}
              />
            ) : (
              <input
                className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1"
                placeholder={f.placeholder}
                value={value[f.key] ?? ''}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value || undefined })}
              />
            )}
          </label>
        ))}
      </div>
    </details>
  );
}

export function emptyVisualDirection(): VisualDirection {
  return {};
}
