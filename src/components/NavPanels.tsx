import { useMemo, useState } from 'react';
import type { Bookmark, StoredDocument } from '../types';

export function ChaptersPanel({ doc, current, onSelect }: { doc: StoredDocument; current: number; onSelect(index: number): void }) {
  const guessed = doc.chapters.some((c) => c.source === 'pattern');
  let active = -1;
  doc.chapters.forEach((c, i) => {
    if (c.paragraphIndex <= current) active = i;
  });
  if (doc.chapters.length === 0) {
    return (
      <p className="muted">
        ఈ డాక్యుమెంట్‌లో శీర్షికలు (Headings) లేవు. “పేరాగ్రాఫ్‌లు” లో వెతికి, ఎక్కడి నుంచైనా చదవడం ప్రారంభించవచ్చు.
      </p>
    );
  }
  return (
    <>
      {guessed && <p className="notice">శీర్షిక శైలులు దొరకలేదు. “పాఠం / అధ్యాయం / Chapter” తో మొదలయ్యే పంక్తుల ఆధారంగా అధ్యాయాలు సూచించాం.</p>}
      <p className="muted small">అధ్యాయం ఎంచుకుంటే అక్కడి నుంచి చదవడం మొదలవుతుంది, తర్వాత క్రమంగా కొనసాగుతుంది.</p>
      <ol className="chapter-list">
        {doc.chapters.map((c, i) => (
          <li key={`${c.paragraphIndex}-${i}`} style={{ paddingInlineStart: `${(Math.min(c.level, 6) - 1) * 1.1}rem` }}>
            <button type="button" className={`list-btn${i === active ? ' active' : ''} level-${Math.min(c.level, 3)}`} aria-current={i === active ? 'true' : undefined} onClick={() => onSelect(c.paragraphIndex)}>
              {c.title}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

export function ParagraphsPanel({ doc, current, onSelect }: { doc: StoredDocument; current: number; onSelect(index: number): void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = doc.paragraphs.map((p, i) => ({ p, i }));
    const filtered = q ? all.filter(({ p }) => p.text.toLowerCase().includes(q)) : all;
    return { total: filtered.length, items: filtered.slice(0, q ? 300 : filtered.length) };
  }, [doc, query]);
  return (
    <>
      <label className="field">
        <span>పాఠ్యంలో వెతకండి</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ఉదా: ధ్యానం" />
      </label>
      {query && <p className="muted small">{results.total} ఫలితాలు{results.total > results.items.length ? ` (మొదటి ${results.items.length})` : ''}</p>}
      <ol className="para-list">
        {results.items.map(({ p, i }) => (
          <li key={i}>
            <button type="button" className={`list-btn${i === current ? ' active' : ''}${p.level ? ' heading' : ''}`} onClick={() => onSelect(i)}>
              <span className="para-no">{i + 1}</span> {p.text.length > 140 ? `${p.text.slice(0, 140)}…` : p.text}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

export function BookmarksPanel({
  bookmarks,
  doc,
  current,
  onAdd,
  onDelete,
  onSelect,
}: {
  bookmarks: Bookmark[];
  doc: StoredDocument;
  current: number;
  onAdd(): void;
  onDelete(b: Bookmark): void;
  onSelect(index: number): void;
}) {
  return (
    <>
      <button type="button" className="primary" onClick={onAdd}>
        🔖 ప్రస్తుత పేరా ({current + 1}) గుర్తుపెట్టు
      </button>
      {bookmarks.length === 0 ? (
        <p className="muted">బుక్‌మార్క్‌లు లేవు.</p>
      ) : (
        <ul className="para-list">
          {bookmarks.map((b) => (
            <li key={b.id} className="row">
              <button type="button" className="list-btn grow" onClick={() => onSelect(b.paragraphIndex)}>
                <span className="para-no">{b.paragraphIndex + 1}</span> {b.label || doc.paragraphs[b.paragraphIndex]?.text.slice(0, 80)}
              </button>
              <button type="button" className="icon-btn danger" onClick={() => onDelete(b)} aria-label="బుక్‌మార్క్ తొలగించు">
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
