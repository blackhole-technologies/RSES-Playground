import { useState, useEffect, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ConfigSidebar } from "@/components/config-sidebar";
import { EditorTextarea } from "@/components/ui/editor-textarea";
import { TestPanel } from "@/components/test-panel";
import { Workbench } from "@/components/workbench/Workbench";
import { useConfig, useUpdateConfig, useValidateConfig } from "@/hooks/use-configs";
import { Button } from "@/components/ui/button";
import { Save, AlertTriangle, Check, Loader2, PlayCircle, Terminal, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Simple debounce hook implementation inline for completeness
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const DEFAULT_CONFIG = `# Welcome to Config Editor
# Start typing your configuration here...

[example]
enabled = true
mode = "strict"
`;

export default function EditorPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: serverConfig, isLoading: isConfigLoading } = useConfig(selectedId);
  
  // Local state for the editor content
  const [content, setContent] = useState(DEFAULT_CONFIG);
  const [isDirty, setIsDirty] = useState(false);
  
  const updateMutation = useUpdateConfig();
  const validateMutation = useValidateConfig();
  const { toast } = useToast();

  // Debounce validation
  const debouncedContent = useDebounceValue(content, 500);

  // Sync server state to local state when loaded
  useEffect(() => {
    if (serverConfig) {
      setContent(serverConfig.content);
      setIsDirty(false);
    } else if (selectedId === null) {
      // New draft mode
      setContent(DEFAULT_CONFIG);
      setIsDirty(false);
    }
  }, [serverConfig, selectedId]);

  // Handle validation
  useEffect(() => {
    if (debouncedContent) {
      validateMutation.mutate(debouncedContent);
    }
  }, [debouncedContent]);

  const handleSave = async () => {
    if (!selectedId) {
      toast({ title: "Please create a config first via the sidebar + button", variant: "default" });
      return;
    }
    
    try {
      await updateMutation.mutateAsync({ id: selectedId, content });
      setIsDirty(false);
      toast({ title: "Configuration saved successfully" });
    } catch (error) {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleNew = () => {
    setSelectedId(null);
    setContent(DEFAULT_CONFIG);
    setIsDirty(false);
  };

  const errors = validateMutation.data?.errors || [];
  const isValid = validateMutation.data?.valid ?? true;

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden text-foreground">
      {/* Sidebar */}
      <ConfigSidebar 
        selectedId={selectedId} 
        onSelect={(id) => setSelectedId(id)}
        onNew={handleNew}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-lg">
              {selectedId ? serverConfig?.name || "Loading..." : "Untitled Draft"}
            </h1>
            {isDirty && (
              <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full border border-yellow-500/30">
                Unsaved Changes
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded bg-background border border-border">
              {validateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : isValid ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span className={cn(
                "text-xs font-medium",
                isValid ? "text-emerald-500" : "text-destructive"
              )}>
                {validateMutation.isPending ? "Validating..." : isValid ? "Valid Configuration" : `${errors.length} Errors Found`}
              </span>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={!isDirty || !selectedId || updateMutation.isPending}
              className={cn(
                "gap-2 transition-all",
                isDirty ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>

        {/* Editor & Panel Layout */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full flex flex-col bg-[#1e1e1e]">
              <EditorTextarea 
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setIsDirty(true);
                }}
                errors={errors}
                className="flex-1"
                placeholder="Type your configuration here..."
              />
              
              {/* Validation Status Footer */}
              {!isValid && (
                <div className="h-32 bg-destructive/10 border-t border-destructive/20 overflow-y-auto p-2">
                  <div className="flex items-center gap-2 mb-2 text-destructive font-semibold text-xs uppercase px-2">
                    <AlertTriangle className="h-3 w-3" />
                    Validation Errors
                  </div>
                  <ul className="space-y-1">
                    {errors.map((err, i) => (
                      <li key={i} className="text-sm text-destructive-foreground/80 px-2 py-1 rounded hover:bg-destructive/20 cursor-pointer font-mono flex gap-2">
                        <span className="font-bold opacity-70">Line {err.line}:</span>
                        <span>{err.message}</span>
                        <span className="text-xs opacity-50 ml-auto border border-destructive/30 px-1 rounded">{err.code}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </ResizablePanel>
          
          <ResizableHandle withHandle className="bg-border" />
          
          <ResizablePanel defaultSize={40} minSize={20}>
            <div className="h-full bg-card">
              <Tabs defaultValue="test" className="h-full flex flex-col">
                <div className="border-b border-border px-4 bg-muted/30">
                  <TabsList className="bg-transparent h-12 p-0 gap-6">
                    <TabsTrigger 
                      value="test" 
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 h-full text-muted-foreground data-[state=active]:text-foreground"
                    >
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Test Playground
                    </TabsTrigger>
                    <TabsTrigger
                      value="preview"
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 h-full text-muted-foreground data-[state=active]:text-foreground"
                    >
                      <Wrench className="h-4 w-4 mr-2" />
                      Workbench
                    </TabsTrigger>
                    <TabsTrigger
                      value="validation"
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 h-full text-muted-foreground data-[state=active]:text-foreground"
                    >
                      <Terminal className="h-4 w-4 mr-2" />
                      JSON Preview
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="test" className="flex-1 m-0 p-0 overflow-hidden">
                  <TestPanel configContent={content} />
                </TabsContent>

                <TabsContent value="preview" className="flex-1 m-0 p-0 overflow-auto">
                  <Workbench
                    configContent={content}
                    parsedConfig={validateMutation.data?.parsed}
                  />
                </TabsContent>

                <TabsContent value="validation" className="flex-1 m-0 p-0 overflow-hidden bg-[#1e1e1e]">
                  <div className="p-4 h-full overflow-auto text-xs font-mono text-green-400/90 whitespace-pre">
                    {validateMutation.data?.parsed 
                      ? JSON.stringify(validateMutation.data.parsed, null, 2)
                      : <span className="text-muted-foreground">// No valid parse result available</span>
                    }
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
