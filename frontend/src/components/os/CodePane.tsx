'use client';

import { useEffect, useRef, useState } from 'react';
import type { CodeFile } from './useAgentEngine';

function tokenize(code: string, lang: string) {
  const parts: { text: string; cls: string }[] = [];
  const comment = lang === 'yaml' ? /#.*$/gm : /\/\/.*$/gm;
  const string = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/gm;
  const keyword = /\b(const|let|var|function|return|import|export|from|new|async|await|class|extends|if|else|true|false|null)\b/g;
  const number = /\b\d+(\.\d+)?\b/g;

  let last = 0;
  const push = (from: number, to: number, cls?: string) => {
    if (to <= from) return;
    parts.push({ text: code.slice(from, to), cls: cls ?? '' });
  };
  const addToken = (regex: RegExp, cls: string) => {
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(code))) {
      const start = m.index;
      if (start < last) continue;
      push(last, start);
      push(start, start + m[0].length, cls);
      last = start + m[0].length;
    }
  };

  addToken(comment, 'os-code-comment');
  addToken(string, 'os-code-string');
  addToken(keyword, 'os-code-keyword');
  addToken(number, 'os-code-number');
  push(last, code.length);
  return parts;
}

export default function CodePane({
  files,
  activeFile,
  onSelectFile,
}: {
  files: CodeFile[];
  activeFile: number;
  onSelectFile: (i: number) => void;
}) {
  const [typed, setTyped] = useState(0);
  const [revealed, setRevealed] = useState<string[]>([]);
  const file = files[activeFile];
  const code = file?.code ?? '';
  const lang = file?.language ?? 'text';

  useEffect(() => {
    setTyped(0);
    setRevealed([]);
  }, [activeFile, code]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTyped((prev) => {
        const next = Math.min(prev + 1 + Math.floor(Math.random() * 2), code.length);
        if (next >= code.length) {
          clearInterval(interval);
          setRevealed([code]);
        }
        return next;
      });
    }, 8);
    return () => clearInterval(interval);
  }, [code]);

  const partial = code.slice(0, typed);
  const tokens = revealed.length > 0 ? tokenize(code, lang) : tokenize(partial, lang);

  return (
    <div className="h-full flex bg-[#07080d]">
      <div className="w-44 shrink-0 border-r border-[var(--os-border)] overflow-y-auto os-scrollbar p-2 hidden sm:block">
        <div className="text-[9px] tracking-[0.25em] uppercase text-[var(--os-text-faint)] px-2 py-2">Explorer</div>
        {files.map((f, i) => (
          <button
            key={f.name}
            onClick={() => onSelectFile(i)}
            className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${
              i === activeFile ? 'bg-[rgba(109,124,255,0.1)] text-white' : 'text-[var(--os-text-dim)] hover:text-white'
            }`}
          >
            <span className="mr-2 text-[var(--os-text-faint)]">{f.language === 'tsx' || f.language === 'ts' ? '⌬' : '▤'}</span>
            {f.name}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1 px-3 h-9 border-b border-[var(--os-border)] overflow-x-auto os-scrollbar">
          {files.map((f, i) => (
            <button
              key={f.name}
              onClick={() => onSelectFile(i)}
              className={`px-3 py-1.5 rounded-t-md text-[11.5px] border-t border-x transition-colors ${
                i === activeFile
                  ? 'bg-[#0a0c14] border-[var(--os-border)] text-white'
                  : 'border-transparent text-[var(--os-text-faint)] hover:text-[var(--os-text-dim)]'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto os-scrollbar">
          {files.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[12px] font-mono text-[var(--os-text-faint)]">
              <span className="os-live-dot mr-2" /> waiting for the agent to write its first file…
            </div>
          ) : (
            <pre className="p-4 font-mono text-[12.5px] leading-[1.65] text-[#c8d0e0]">
              <code>
                {tokens.map((tok, i) => (
                  <span key={i} className={tok.cls}>
                    {tok.text}
                  </span>
                ))}
                {typed < code.length && <span className="os-caret" />}
              </code>
            </pre>
          )}
        </div>
      </div>
      <style>{`
        .os-code-keyword { color: #9b6dff; }
        .os-code-string { color: #34e0a1; }
        .os-code-number { color: #ffc46b; }
        .os-code-comment { color: #454d63; font-style: italic; }
      `}</style>
    </div>
  );
}
