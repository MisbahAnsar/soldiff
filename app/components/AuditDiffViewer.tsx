"use client";

import { useMemo, useState } from "react";
import type { DiffLine } from "@/app/data/demos";

const PAGE_SIZE = 80;

interface Props {
  lines: DiffLine[];
  sectionName: string;
}

export default function AuditDiffViewer({ lines, sectionName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const changed = useMemo(
    () => lines.filter((l) => l.type === "added" || l.type === "removed"),
    [lines]
  );
  const displayLines = useMemo(() => {
    if (!expanded) return [];
    return lines.filter((l) => l.type !== "unchanged").slice(0, visibleCount);
  }, [expanded, lines, visibleCount]);

  const added = changed.filter((l) => l.type === "added").length;
  const removed = changed.filter((l) => l.type === "removed").length;
  const modified = changed.length > 0;

  return (
    <div className="audit-diff">
      <button
        type="button"
        className="audit-diff-summary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="audit-diff-summary-main">
          <span className="audit-diff-section">{sectionName}</span>
          <span className={`audit-diff-status ${modified ? "is-modified" : "is-unchanged"}`}>
            {modified ? "Modified" : "Unchanged"}
          </span>
          {modified && (
            <span className="audit-diff-meta">
              (+{added} / −{removed} blocks)
            </span>
          )}
        </div>
        <span className="audit-diff-toggle">{expanded ? "Collapse" : "Expand"}</span>
      </button>

      {expanded && (
        <div className="audit-diff-panel">
          <div className="audit-diff-header">
            <span>Old</span>
            <span>New</span>
            <span />
            <span>Content</span>
          </div>
          <div className="audit-diff-body">
            {displayLines.length === 0 ? (
              <div className="audit-diff-empty">No changed blocks in this section.</div>
            ) : (
              displayLines.map((line, i) => (
                <DiffRow key={`${line.type}-${i}`} line={line} />
              ))
            )}
          </div>
          {expanded && visibleCount < lines.filter((l) => l.type !== "unchanged").length && (
            <button
              type="button"
              className="audit-diff-more"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            >
              Show more ({Math.min(PAGE_SIZE, lines.length - visibleCount)} rows)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const isAdd = line.type === "added";
  const isRemove = line.type === "removed";
  const rowClass = isAdd ? "diff-add" : isRemove ? "diff-remove" : "diff-context";

  return (
    <div className={`audit-diff-row ${rowClass}`}>
      <span className="audit-diff-gutter">{isAdd ? "" : line.lineA ?? ""}</span>
      <span className="audit-diff-gutter">{isRemove ? "" : line.lineB ?? ""}</span>
      <span className="audit-diff-sign">{isAdd ? "+" : isRemove ? "−" : " "}</span>
      <code className="audit-diff-content">{line.content}</code>
    </div>
  );
}
