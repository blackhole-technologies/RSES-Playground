import { cn } from "@/lib/utils";

interface AttributeBadgesProps {
  derivedAttributes: Record<string, string>;
  manualAttributes: Record<string, string>;
  className?: string;
}

export function AttributeBadges({
  derivedAttributes,
  manualAttributes,
  className
}: AttributeBadgesProps) {
  const hasDerived = Object.keys(derivedAttributes).length > 0;
  const hasManual = Object.keys(manualAttributes).length > 0;

  if (!hasDerived && !hasManual) {
    return (
      <p className={cn("text-xs text-muted-foreground italic", className)}>
        No attributes
      </p>
    );
  }

  return (
    <table className={cn("w-full text-sm", className)}>
      <tbody>
        {/* Auto-derived attributes */}
        {Object.entries(derivedAttributes).map(([key, value]) => (
          <tr key={`derived-${key}`} className="hover:bg-muted/30">
            <td className="py-1 pr-2 w-6">
              <span title="Auto-derived">✨</span>
            </td>
            <td className="py-1 pr-2 font-mono text-muted-foreground">{key}</td>
            <td className="py-1 pr-2 text-muted-foreground">=</td>
            <td className="py-1 font-mono text-amber-400">{value}</td>
          </tr>
        ))}

        {/* Manual attributes */}
        {Object.entries(manualAttributes).map(([key, value]) => (
          <tr key={`manual-${key}`} className="hover:bg-muted/30">
            <td className="py-1 pr-2 w-6">
              <span title="Manual">👤</span>
            </td>
            <td className="py-1 pr-2 font-mono text-muted-foreground">{key}</td>
            <td className="py-1 pr-2 text-muted-foreground">=</td>
            <td className="py-1 font-mono text-blue-400">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
