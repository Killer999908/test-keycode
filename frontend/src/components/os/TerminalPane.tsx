'use client';

import { useEffect, useRef } from 'react';
import type { TerminalLine } from './useAgentEngine';

const TYPE_COLOR: Record<TerminalLine['type'], string> = {
  cmd: '#38d6ff',
  info: '#7a8299',
  ok: '#34e0a1',
  warn: '#ffc46b',
  err: '#ff5d6c',
  blank: '#454d63',
};

const TYPE_PREFIX: Record<TerminalLine['type'], string> = {
  cmd: '❯',
  info: '›',
  ok: '✓',
  warn: '⚠',
  err: '✗',
  blank: '',
};

export default function TerminalPane({ lines }: { lines: TerminalLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="h-full flex flex-col bg-[#05060a] font-mono text-[12.5px]">
      <div className="flex items-center gap-2 px-4 h-9 border-b border-[var(--os-border)] text-[11px] text-[var(--os-text-faint)]">
        <span className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[rgba(255,255,255,0.08)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[rgba(255,255,255,0.08)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[rgba(255,255,255,0.08)]" />
        </span>
        <span className="ml-2">keycode-agent — zsh</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto os-scrollbar p-4 leading-[1.7]">
        {lines.length === 0 && (
          <div className="text-[var(--os-text-faint)]">
            <span className="text-[var(--os-accent)]">❯</span> waiting for build command…
          </div>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className="os-rise whitespace-pre-wrap break-words"
            style={{ animationDelay: `${Math.min(i * 0.01, 0.2)}s`, color: TYPE_COLOR[line.type] }}
          >
            {TYPE_PREFIX[line.type]} {line.text}
          </div>
        ))}
        {(lines.length > 0 && lines[lines.length - 1].type !== 'blank') && (
          <div className="text-[var(--os-accent)]">❯ <span className="os-caret" /></div>
        )}
      </div>
    </div>
  );
}
