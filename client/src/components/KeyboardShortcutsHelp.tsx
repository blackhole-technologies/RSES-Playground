/**
 * @file KeyboardShortcutsHelp.tsx
 * @description Component showing available keyboard shortcuts.
 * @phase Phase 4 - UI/UX Improvements
 * @author UI (UI Development Expert Agent)
 * @validated UX (UX Design Expert Agent)
 * @created 2026-01-31
 */

import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatShortcut } from "@/hooks/use-keyboard";

interface ShortcutItem {
  keys: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean };
  description: string;
}

const shortcuts: ShortcutItem[] = [
  { keys: { key: "S", ctrl: true }, description: "Save configuration" },
  { keys: { key: "N", ctrl: true }, description: "New configuration" },
  { keys: { key: "1", ctrl: true }, description: "Switch to Test tab" },
  { keys: { key: "2", ctrl: true }, description: "Switch to Workbench tab" },
  { keys: { key: "3", ctrl: true }, description: "Switch to JSON tab" },
  { keys: { key: "?", shift: true }, description: "Show keyboard shortcuts" },
];

export function KeyboardShortcutsHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Keyboard className="h-4 w-4" />
          <span className="sr-only">Keyboard shortcuts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to work more efficiently.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-2">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <span className="text-sm text-muted-foreground">
                {shortcut.description}
              </span>
              <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border">
                {formatShortcut(shortcut.keys.key, {
                  ctrl: shortcut.keys.ctrl,
                  alt: shortcut.keys.alt,
                  shift: shortcut.keys.shift,
                  meta: shortcut.keys.meta,
                })}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsHelp;
