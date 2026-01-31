import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Play, AlertCircle, CheckCircle2, Sparkles } from "lucide-react";
import { useTestConfig } from "@/hooks/use-configs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface TestPanelProps {
  configContent: string;
}

// Helper to derive attributes from path (mirrors server-side logic)
function deriveAttributesFromPath(filepath: string): Record<string, string> {
  const parts = filepath.split('/').filter(Boolean);
  const derived: Record<string, string> = {};

  if (parts[0] === 'by-ai' && parts.length >= 2) {
    derived.source = parts[1];
  }

  return derived;
}

export function TestPanel({ configContent }: TestPanelProps) {
  const [filename, setFilename] = useState("example.txt");
  const [attributes, setAttributes] = useState<{ key: string; value: string }[]>([]);
  const testMutation = useTestConfig();

  // Detect auto-derived attributes from filename (if it looks like a path)
  const derivedAttributes = useMemo(() => deriveAttributesFromPath(filename), [filename]);
  const hasDerivedAttrs = Object.keys(derivedAttributes).length > 0;

  const handleAddAttribute = () => {
    setAttributes([...attributes, { key: "", value: "" }]);
  };

  const handleAttributeChange = (index: number, field: "key" | "value", val: string) => {
    const newAttrs = [...attributes];
    newAttrs[index][field] = val;
    setAttributes(newAttrs);
  };

  const handleRemoveAttribute = (index: number) => {
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const handleRunTest = () => {
    const manualAttrs = attributes.reduce((acc, curr) => {
      if (curr.key) acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    // Combine derived and manual attributes (manual takes precedence)
    const combinedAttrs = { ...derivedAttributes, ...manualAttrs };

    // Extract just the project name for the filename matcher
    const projectName = filename.split('/').filter(Boolean).pop() || filename;

    testMutation.mutate({
      configContent,
      filename: projectName,
      attributes: combinedAttrs
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="p-4 border-b border-border bg-card/30">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Play className="h-4 w-4 text-primary" />
          Test Playground
        </h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="filename" className="text-xs uppercase text-muted-foreground font-bold">Filename / Path</Label>
              {hasDerivedAttrs && (
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <Sparkles className="h-3 w-3" />
                  Auto-derive
                </span>
              )}
            </div>
            <Input
              id="filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className={cn(
                "font-mono text-sm bg-background border-input",
                hasDerivedAttrs && "border-amber-500/30 focus:border-amber-500"
              )}
              placeholder="project-name or by-ai/claude/project"
            />
            {hasDerivedAttrs && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(derivedAttributes).map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    <span className="opacity-70">{key}:</span>
                    <span className="font-semibold">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground font-bold">Attributes</Label>
              <Button onClick={handleAddAttribute} size="sm" variant="ghost" className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            
            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
              {attributes.map((attr, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input 
                    placeholder="Key" 
                    value={attr.key}
                    onChange={(e) => handleAttributeChange(idx, "key", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Input 
                    placeholder="Value" 
                    value={attr.value}
                    onChange={(e) => handleAttributeChange(idx, "value", e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveAttribute(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {attributes.length === 0 && (
                <div className="text-xs text-muted-foreground italic px-2 py-1 border border-dashed border-border rounded">
                  No attributes defined
                </div>
              )}
            </div>
          </div>

          <Button 
            className="w-full bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
            onClick={handleRunTest}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? "Running Engine..." : "Run Match Test"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Results
        </div>
        
        <ScrollArea className="flex-1 p-4">
          {testMutation.isError ? (
            <div className="flex flex-col items-center justify-center h-40 text-destructive p-4 text-center border border-destructive/20 rounded-lg bg-destructive/5">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="font-semibold">Test Failed</p>
              <p className="text-sm mt-1 opacity-80">{testMutation.error.message}</p>
            </div>
          ) : testMutation.data ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Matches Found
                </h4>
                <Separator />
              </div>

              <ResultSection title="Sets" items={testMutation.data.sets} color="blue" />
              <ResultSection title="Topics" items={testMutation.data.topics} color="purple" />
              <ResultSection title="Types" items={testMutation.data.types} color="amber" />
              <ResultSection title="Filetypes" items={testMutation.data.filetypes} color="emerald" />
              
              {Object.values(testMutation.data).every(arr => Array.isArray(arr) && arr.length === 0) && (
                 <div className="text-center py-8 text-muted-foreground">
                   <p>No matches returned for this input.</p>
                 </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 space-y-2">
              <Play className="h-12 w-12 opacity-20" />
              <p className="text-sm">Run a test to see matching results</p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

function ResultSection({ title, items, color }: { title: string, items: string[], color: string }) {
  if (!items || items.length === 0) return null;
  
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  return (
    <div className="space-y-2">
      <h5 className="text-xs uppercase text-muted-foreground font-bold">{title}</h5>
      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span key={i} className={cn(
            "px-2.5 py-1 rounded-md text-sm border font-mono",
            colorMap[color] || colorMap.blue
          )}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
