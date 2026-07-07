interface PageTab {
  id: string;
  name?: string;
}

interface DesignPageTabsProps {
  pages: PageTab[];
  activePageId: string;
  onSelect: (pageId: string) => void;
}

/** Carousel / multi-page navigation above the design canvas. */
export function DesignPageTabs({ pages, activePageId, onSelect }: DesignPageTabsProps) {
  if (pages.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 py-2">
      {pages.map((page, index) => {
        const active = page.id === activePageId;
        const label = page.name?.trim() || `Slide ${index + 1}`;
        return (
          <button
            key={page.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            onClick={() => onSelect(page.id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
