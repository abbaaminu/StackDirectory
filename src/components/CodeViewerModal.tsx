import React, { useState } from "react";
import {
  X,
  Copy,
  Check,
  FileCode,
  Database,
  Code2,
  Layers,
  KeyRound,
  Download,
  ExternalLink,
} from "lucide-react";
import { CODE_FILES } from "../data/nextjsCodebase";
import { CodeFile } from "../types/directory";

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodeViewerModal: React.FC<CodeViewerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copiedFileIndex, setCopiedFileIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  if (!isOpen) return null;

  const currentFile = CODE_FILES[activeFileIndex];

  const handleCopySingle = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedFileIndex(index);
    setTimeout(() => setCopiedFileIndex(null), 2000);
  };

  const handleCopyAll = () => {
    const allCode = CODE_FILES.map(
      (f) =>
        `// ==========================================\n// FILE: ${f.filepath}\n// DESCRIPTION: ${f.description}\n// ==========================================\n\n${f.code}`,
    ).join("\n\n\n");

    navigator.clipboard.writeText(allCode);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const getFileIcon = (lang: string) => {
    switch (lang) {
      case "sql":
        return <Database className="w-3.5 h-3.5 text-blue-400" />;
      case "typescript":
      case "tsx":
        return <FileCode className="w-3.5 h-3.5 text-amber-400" />;
      case "env":
        return <KeyRound className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Code2 className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="relative w-full max-w-5xl h-[88vh] bg-[#0a0b10] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col text-zinc-100 overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-[#0e0f17] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Production Codebase & Architecture
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Ready for VS Code
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Complete Next.js 15, Supabase PostgreSQL schema, and Paddle
                Webhook Route Handler.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition active:scale-95 shadow-sm"
            >
              {copiedAll ? (
                <Check className="w-3.5 h-3.5 text-zinc-950 stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedAll ? "All Files Copied!" : "Copy All Files"}</span>
            </button>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Content: Sidebar Tabs + Code Viewer */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* File Selector Sidebar */}
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-[#0c0d14] p-3 space-y-1 overflow-y-auto shrink-0">
            <div className="px-2 py-1 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Project Structure
            </div>
            {CODE_FILES.map((file, idx) => {
              const isActive = activeFileIndex === idx;
              return (
                <button
                  key={file.filepath}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono text-left transition ${
                    isActive
                      ? "bg-zinc-800 text-white font-semibold border border-zinc-700 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getFileIcon(file.language)}
                    <span className="truncate">{file.filename}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase">
                    {file.language}
                  </span>
                </button>
              );
            })}

            {/* Architecture Overview Card */}
            <div className="mt-4 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 space-y-2">
              <div className="font-bold text-zinc-300">Stack Highlights:</div>
              <ul className="space-y-1 list-disc list-inside text-zinc-400 leading-relaxed text-[11px]">
                <li>
                  <strong className="text-zinc-200">Supabase:</strong> Row-level
                  security, uuid extension, and atomic upvote RPC.
                </li>
                <li>
                  <strong className="text-zinc-200">Next.js 15:</strong>{" "}
                  Server-side data fetching with ISR revalidation.
                </li>
                <li>
                  <strong className="text-zinc-200">Paddle:</strong> Webhook
                  signature verification and instant DB upgrade.
                </li>
              </ul>
            </div>
          </div>

          {/* Active File Code View */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#07080c]">
            {/* File Path & Description Bar */}
            <div className="px-5 py-3 border-b border-zinc-800/80 bg-[#090a0f] flex items-center justify-between gap-4 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-amber-300">
                    {currentFile.filepath}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {currentFile.description}
                </p>
              </div>

              <button
                onClick={() =>
                  handleCopySingle(currentFile.code, activeFileIndex)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition"
              >
                {copiedFileIndex === activeFileIndex ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy File</span>
                  </>
                )}
              </button>
            </div>

            {/* Code Content */}
            <div className="flex-1 p-5 overflow-auto font-mono text-xs text-zinc-300 leading-relaxed selection:bg-amber-500/20 selection:text-amber-300 scrollbar-thin">
              <pre className="whitespace-pre">
                <code>{currentFile.code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
