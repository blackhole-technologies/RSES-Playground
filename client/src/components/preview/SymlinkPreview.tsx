import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Symlink {
  type: 'topic' | 'type';
  name: string;
  target: string;
  category: string;
}

interface SymlinkPreviewProps {
  symlinks: Symlink[];
  className?: string;
}

export function SymlinkPreview({ symlinks, className }: SymlinkPreviewProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (symlinks.length === 0) {
    return (
      <div className={cn("text-center py-6 text-muted-foreground/50", className)}>
        <span className="text-2xl opacity-30">🔗</span>
        <p className="text-sm mt-2">No symlinks generated</p>
      </div>
    );
  }

  const handleCopy = async (symlink: Symlink, index: number) => {
    const command = `ln -s "${symlink.target}" "${symlink.category}/${symlink.name}"`;
    await navigator.clipboard.writeText(command);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <ul className={cn("space-y-1", className)}>
      {symlinks.map((symlink, i) => (
        <li
          key={i}
          className="group flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/50 transition-colors text-sm"
        >
          {/* Emoji prefix */}
          <span className="shrink-0">🔗</span>

          {/* Link name - blue, bold */}
          <span className="text-blue-400 font-semibold shrink-0">
            {symlink.name}
          </span>

          {/* Arrow */}
          <span className="text-muted-foreground shrink-0">→</span>

          {/* Target path - monospace */}
          <span className="font-mono text-xs text-muted-foreground truncate">
            {symlink.target}
          </span>

          {/* Category - right aligned, gray italic */}
          <span className="ml-auto text-xs text-muted-foreground/70 italic shrink-0">
            in {symlink.category}
          </span>

          {/* Copy button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={() => handleCopy(symlink, i)}
          >
            {copiedIndex === i ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}
