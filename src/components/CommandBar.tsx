import React, { useState } from "react";
import type { Screen } from "@/types/grounded";

interface CommandBarProps {
  onCommand: (screen: Screen) => void;
}

export function CommandBar({ onCommand }: CommandBarProps) {
  const [command, setCommand] = useState("");
  const [showCommandBar, setShowCommandBar] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "/" && !e.shiftKey) {
      e.preventDefault();
      setShowCommandBar(true);
      // Focus the input after showing
      setTimeout(() => {
        const input = document.getElementById("command-input");
        if (input) input.focus();
      }, 10);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = command.trim().toLowerCase();
    
    if (cmd === "/dashboard" || cmd === "/today" || cmd === "dashboard") onCommand("dashboard");
    else if (cmd === "/settings" || cmd === "settings") onCommand("settings");
    else if (cmd === "/privacy" || cmd === "privacy") onCommand("privacy");
    else if (cmd === "/analytics" || cmd === "analytics") onCommand("dashboard"); // mapping analytics to dashboard since that's what we have
    else if (cmd === "/main" || cmd === "main") onCommand("main");
    
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
        <div
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Command bar trigger"
          style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)" }}
        >
          <span style={{ opacity: 0.5, fontSize: 12 }}>Type "/" for commands</span>
        </div>
      )}
      {showCommandBar && (
        <div className="command-bar">
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              id="command-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter command..."
              autoComplete="off"
            />
            <button type="submit" style={{ marginLeft: 8 }}>
              Go
            </button>
            <button type="button" onClick={handleCancel} style={{ marginLeft: 4 }}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </>
  );
}