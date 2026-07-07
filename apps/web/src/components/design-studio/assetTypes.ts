/** Shared asset pick types for Design Studio (mirrors asset library search). */

export type AssetKind = 'icon' | 'illustration' | 'photo' | 'ai';

export interface AssetSearchResult {
  provider: string;
  providerId: string;
  kind: AssetKind;
  contentUrl: string;
  thumbUrl: string;
  sourceUrl?: string;
  creator?: string;
  licence: string;
  attributionRequired: boolean;
  usageTier: 1 | 2 | 3;
  label: string;
}

export interface AssetLibraryItem {
  id: string;
  type: string;
  provider: string | null;
  licence: string | null;
  usageTier: number;
  approved: boolean;
  shared: boolean;
  attributionRequired: boolean;
  contentUrl: string | null;
  thumbUrl: string | null;
  creator: string | null;
  filename: string;
  tags: string[];
}

/** Normalised pick applied onto a design element. */
export interface AssetPick {
  contentUrl: string;
  thumbUrl?: string;
  label: string;
  provider: string;
  providerId?: string;
  creator?: string;
  attributionRequired: boolean;
  libraryItemId?: string;
  kind: AssetKind;
  usageTier: 1 | 2 | 3;
}

export function pickFromSearch(r: AssetSearchResult): AssetPick {
  return {
    contentUrl: r.contentUrl,
    thumbUrl: r.thumbUrl,
    label: r.label,
    provider: r.provider,
    providerId: r.providerId,
    creator: r.creator,
    attributionRequired: r.attributionRequired,
    kind: r.kind,
    usageTier: r.usageTier,
  };
}

export function pickFromLibrary(item: AssetLibraryItem): AssetPick | null {
  if (!item.contentUrl) return null;
  const kind: AssetKind =
    item.type === 'ICON' ? 'icon' : item.type === 'PHOTO' ? 'photo' : 'illustration';
  return {
    contentUrl: item.contentUrl,
    thumbUrl: item.thumbUrl ?? undefined,
    label: item.filename,
    provider: item.provider ?? 'library',
    attributionRequired: item.attributionRequired,
    libraryItemId: item.id,
    kind,
    usageTier: item.usageTier as 1 | 2 | 3,
    creator: item.creator ?? undefined,
  };
}

export function attributionLine(pick: AssetPick): string | null {
  if (!pick.attributionRequired) return null;
  const who = pick.creator ? ` by ${pick.creator}` : '';
  return `${pick.label}${who} (${pick.provider})`.slice(0, 200);
}
