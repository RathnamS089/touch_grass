import React, { useState, useEffect, useRef } from "react";
import { Command } from "lucide-react";
import type { Screen } from "@/types/grounded";

interface CommandBarProps {
  onCommand: (screen: Screen) => void;
  onAskLLM?: (query: string) => void;
}

export function CommandBar({ onCommand, onAskLLM }: CommandBarProps) {
  const [command, setCommand] = useState("");
  const [showCommandBar, setShowCommandBar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.shiftKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setShowCommandBar(true);
      } else if (e.key === 'Escape' && showCommandBar) {
        setShowCommandBar(false);
        setCommand("");
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showCommandBar]);

  useEffect(() => {
    if (showCommandBar && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCommandBar]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = command.trim().toLowerCase();

    if (cmd === "/dashboard" || cmd === "/today" || cmd === "dashboard") onCommand("dashboard");
    else if (cmd === "/settings" || cmd === "settings") onCommand("settings");
    else if (cmd === "/privacy" || cmd === "privacy") onCommand("privacy");
    else if (cmd === "/analytics" || cmd === "analytics") onCommand("dashboard");
    else if (cmd === "/main" || cmd === "main") onCommand("main");
    else if (command.trim().length > 0 && onAskLLM) {
      // Not a known command — treat it as a question for the LLM
      onAskLLM(command.trim());
    }

    setShowCommandBar(false);
    setCommand("");
  };

  const handleCancel = () => {
    setShowCommandBar(false);
    setCommand("");
  };

  return (
    <>
      {!showCommandBar && (
        <button
          type="button"
          onClick={() => setShowCommandBar(true)}
          className="command-launcher"
        >
          <Command size={14} className="opacity-70" />
          <span>Type "/" for commands, or ask anything</span>
        </button>
      )}

      {showCommandBar && (
        <div className="command-panel">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-3 p-2 rounded-2xl bg-black/70 backdrop-blur-xl border border-green-800/40 shadow-2xl"
          >
            <div className="flex items-center pl-3 text-green-400/70">
              <Command size={16} />
            </div>
            <input
              ref={inputRef}
              type="text"
              id="command-input"
              aria-label="Command or question"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="/dashboard, /settings, or ask anything…"
              autoComplete="off"
              className="flex-1 bg-transparent border-none text-green-50 text-sm focus:outline-none placeholder:text-green-100/30 w-full py-1.5"
            />
            <div className="flex gap-1 pr-1">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs text-green-100/60 hover:text-green-100 hover:bg-white/5 rounded-lg transition-colors"
              >
                Esc
              </button>
              <button
                type="submit"
                disabled={!command.trim()}
                className="px-3 py-1.5 text-xs font-medium text-black bg-green-400 hover:bg-green-300 rounded-lg transition-colors shadow-[0_0_15px_rgba(74,222,128,0.2)]"
              >
                Go
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
