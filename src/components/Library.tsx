import { useRef } from 'react';
import { ACCEPTED_EXTENSIONS } from '../parsers';
import type { DocumentSummary } from '../types';

export interface ImportState {
  stage: string;
  fraction: number;
  fileName: string;
}

interface Props {
  documents: DocumentSummary[];
  progress: Record<string, number>;
  importing: ImportState | null;
  onImport(file: File): void;
  onOpen(id: string): void;
  onDelete(doc: DocumentSummary): void;
}

const FORMAT_LABEL = { docx: 'Word', epub: 'EPUB', txt: 'టెక్స్ట్' } as const;

export function OpenButton({ onImport, disabled }: { onImport(file: File): void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="primary big" onClick={() => input.current?.click()} disabled={disabled}>
        📂 డాక్యుమెంట్ తెరవండి
      </button>
      <input
        ref={input}
        type="file"
        accept={`${ACCEPTED_EXTENSIONS},application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip,text/plain`}
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onImport(file);
        }}
      />
    </>
  );
}

export function Library({ documents, progress, importing, onImport, onOpen, onDelete }: Props) {
  return (
    <main className="library" id="main">
      <section className="card intro">
        <p>
          మీ ఫోన్‌లోని <strong>Word (.docx)</strong>, <strong>EPUB (.epub)</strong> లేదా <strong>టెక్స్ట్ (.txt)</strong> ఫైల్‌ను తెరిచి, అధ్యాయం ఎంచుకుని వినండి.
          ఫైల్ మీ ఫోన్‌లోనే ఉంటుంది — ఎక్కడికీ అప్‌లోడ్ కాదు.
        </p>
        <OpenButton onImport={onImport} disabled={!!importing} />
        {importing && (
          <div className="import-progress" role="status" aria-live="polite">
            <div>
              {importing.fileName}: {importing.stage}
            </div>
            <progress max={1} value={importing.fraction} />
          </div>
        )}
      </section>

      <section aria-labelledby="lib-title">
        <h2 id="lib-title">నా డాక్యుమెంట్లు</h2>
        {documents.length === 0 ? (
          <p className="muted">ఇంకా ఏ డాక్యుమెంట్ తెరవలేదు.</p>
        ) : (
          <ul className="doc-list">
            {documents.map((d) => {
              const index = progress[d.id];
              const percent = index === undefined ? 0 : Math.round(((index + 1) / Math.max(1, d.paragraphCount)) * 100);
              return (
                <li key={d.id} className="card doc-item">
                  <button type="button" className="doc-open" onClick={() => onOpen(d.id)}>
                    <span className="doc-title">{d.title}</span>
                    <span className="muted small">
                      {FORMAT_LABEL[d.format]} · {d.paragraphCount} పేరాలు · {index === undefined ? 'ఇంకా ప్రారంభించలేదు' : `${percent}% చదివారు`}
                    </span>
                    <span className="bar" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                  </button>
                  <button type="button" className="icon-btn danger" onClick={() => onDelete(d)} aria-label={`${d.title} తొలగించు`}>
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
