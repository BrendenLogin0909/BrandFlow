import type { BrandTokensSnapshot, Colour } from '@brandflow/design-schema';

const TOKEN_LABELS = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'background',
  'text',
] as const;

export interface BrandColourPickerProps {
  colours: BrandTokensSnapshot['colours'];
  value: Colour;
  onChange: (colour: Colour) => void;
  allowRawOverride?: boolean;
}

export function BrandColourPicker({
  colours,
  value,
  onChange,
  allowRawOverride = false,
}: BrandColourPickerProps) {
  const rawHex = value.kind === 'raw' ? value.hex : '#000000';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {TOKEN_LABELS.map((token) => {
          const hex = colours[token];
          const active = value.kind === 'token' && value.token === token;
          return (
            <button
              key={token}
              type="button"
              title={token}
              className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] capitalize ${
                active ? 'border-indigo-500 ring-1 ring-indigo-300' : 'border-slate-200'
              }`}
              onClick={() => onChange({ kind: 'token', token })}
            >
              <span
                className="h-4 w-4 shrink-0 rounded border border-black/10"
                style={{ backgroundColor: hex }}
              />
              {token.slice(0, 4)}
            </button>
          );
        })}
      </div>
      {allowRawOverride && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Custom
          <input
            type="color"
            value={rawHex}
            onChange={(e) =>
              onChange({ kind: 'raw', hex: e.target.value, allowedOverride: true })
            }
            className="h-7 w-10 cursor-pointer rounded border border-slate-300"
          />
        </label>
      )}
    </div>
  );
}
