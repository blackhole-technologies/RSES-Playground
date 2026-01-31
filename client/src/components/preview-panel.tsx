import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, AlertCircle } from "lucide-react";
import { usePreview, type PreviewResult } from "@/hooks/use-preview";
import { AttributeBadges } from "@/components/preview/AttributeBadges";
import { SymlinkPreview } from "@/components/preview/SymlinkPreview";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  configContent: string;
}

// Simple debounce hook
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function PreviewPanel({ configContent }: PreviewPanelProps) {
  const [testPath, setTestPath] = useState("by-ai/claude/quantum-app");
  const [manualAttributes, setManualAttributes] = useState<{ key: string; value: string }[]>([]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  const previewMutation = usePreview();

  // Debounce both config content and test path
  const debouncedConfig = useDebounceValue(configContent, 500);
  const debouncedPath = useDebounceValue(testPath, 500);

  // Convert manual attributes array to record
  const manualAttrsRecord = manualAttributes.reduce((acc, curr) => {
    if (curr.key) acc[curr.key] = curr.value;
    return acc;
  }, {} as Record<string, string>);

  // Auto-trigger preview on changes
  useEffect(() => {
    if (debouncedConfig && debouncedPath) {
      previewMutation.mutate(
        {
          configContent: debouncedConfig,
          testPath: debouncedPath,
          manualAttributes: manualAttrsRecord,
        },
        {
          onSuccess: (data) => setPreviewResult(data),
        }
      );
    }
  }, [debouncedConfig, debouncedPath, JSON.stringify(manualAttrsRecord)]);

  const handleAddAttribute = () => {
    setManualAttributes([...manualAttributes, { key: "", value: "" }]);
  };

  const handleAttributeChange = (index: number, field: "key" | "value", val: string) => {
    const newAttrs = [...manualAttributes];
    newAttrs[index][field] = val;
    setManualAttributes(newAttrs);
  };

  const handleRemoveAttribute = (index: number) => {
    setManualAttributes(manualAttributes.filter((_, i) => i !== index));
  };

  // Detect if path has auto-derive pattern
  const hasAutoDerivePattern = testPath.startsWith('by-ai/');

  return (
    <div className="flex flex-col h-full bg-background">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-[800px]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Live Preview</h3>
            {previewMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Path Input - workbench style */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                Test Path
              </Label>
              {hasAutoDerivePattern && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  ✨ auto-derive
                </span>
              )}
            </div>
            <Input
              value={testPath}
              onChange={(e) => setTestPath(e.target.value)}
              className={cn(
                "font-mono text-sm",
                hasAutoDerivePattern && "border-amber-500/30 focus:border-amber-500"
              )}
              placeholder="by-ai/claude/project-name"
            />
          </section>

          {/* Manual Attributes */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">
                Manual Attributes
              </Label>
              <Button onClick={handleAddAttribute} size="sm" variant="ghost" className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {manualAttributes.length > 0 ? (
              <div className="space-y-1.5">
                {manualAttributes.map((attr, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      placeholder="key"
                      value={attr.key}
                      onChange={(e) => handleAttributeChange(idx, "key", e.target.value)}
                      className="h-7 text-xs font-mono"
                    />
                    <span className="text-muted-foreground">=</span>
                    <Input
                      placeholder="value"
                      value={attr.value}
                      onChange={(e) => handleAttributeChange(idx, "value", e.target.value)}
                      className="h-7 text-xs font-mono"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveAttribute(idx)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No manual attributes</p>
            )}
          </section>

          {/* Error State */}
          {previewMutation.isError && (
            <div className="flex items-center gap-2 p-3 rounded border border-destructive/20 bg-destructive/5 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{previewMutation.error.message}</span>
            </div>
          )}

          {/* Results */}
          {previewResult && (
            <>
              {/* Attributes Section - workbench style */}
              <section className="space-y-2">
                <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-1">
                  Attributes
                </h4>
                <AttributeBadges
                  derivedAttributes={previewResult.derivedAttributes}
                  manualAttributes={manualAttrsRecord}
                />
              </section>

              {/* Matched Sets - table style like tool-workbench */}
              {previewResult.matchedSets.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-1">
                    Matched Sets
                  </h4>
                  <table className="w-full text-sm">
                    <tbody>
                      {previewResult.matchedSets.map((set, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="py-1 pr-4">
                            <span className="font-mono text-blue-400">${set}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* Symlinks - workbench style */}
              <section className="space-y-2">
                <h4 className="text-xs uppercase text-muted-foreground font-bold tracking-wider border-b border-border pb-1">
                  Generated Symlinks
                </h4>
                <SymlinkPreview symlinks={previewResult.symlinks} />
              </section>
            </>
          )}

          {/* Empty state */}
          {!previewResult && !previewMutation.isPending && !previewMutation.isError && (
            <div className="text-center py-12 text-muted-foreground/50">
              <span className="text-4xl">🔗</span>
              <p className="text-sm mt-2">Enter a path to preview symlinks</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
