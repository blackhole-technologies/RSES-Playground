import { useState, useEffect, useCallback } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ConfigSidebar } from "@/components/config-sidebar";
import { MonacoEditor } from "@/components/MonacoEditor";
import { TestPanel } from "@/components/test-panel";
import { Workbench } from "@/components/workbench/Workbench";
import { useConfig, useUpdateConfig, useValidateConfig } from "@/hooks/use-configs";
import { Button } from "@/components/ui/button";
import { Save, AlertTriangle, Check, Loader2, PlayCircle, Terminal, Wrench, Keyboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts, formatShortcut } from "@/hooks/use-keyboard";
import { useNavigationGuard } from "@/hooks/use-unsaved-changes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Active tab state for keyboard navigation
  const [activeTab, setActiveTab] = useState<string>("test");

  // Navigation guard for unsaved changes
  const canNavigate = useNavigationGuard(isDirty);

  // Browser warning for unsaved changes
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Wrap config selection with confirmation
  const handleSelectConfig = useCallback((id: number | null) => {
    if (isDirty && !canNavigate()) {
      return;
    }
    setSelectedId(id);
  }, [isDirty, canNavigate]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "s",
      modifiers: { ctrl: true },
      description: "Save configuration",
      action: handleSave,
      disabled: !isDirty || !selectedId,
    },
    {
      key: "s",
      modifiers: { meta: true },
      description: "Save configuration (Mac)",
      action: handleSave,
      disabled: !isDirty || !selectedId,
    },
    {
      key: "1",
      modifiers: { ctrl: true },
      description: "Switch to Test tab",
      action: () => setActiveTab("test"),
    },
    {
      key: "2",
      modifiers: { ctrl: true },
      description: "Switch to Workbench tab",
      action: () => setActiveTab("preview"),
    },
    {
      key: "3",
      modifiers: { ctrl: true },
      description: "Switch to JSON tab",
      action: () => setActiveTab("validation"),
    },
    {
      key: "n",
      modifiers: { ctrl: true },
      description: "New configuration",
      action: handleNew,
    },
  ]);

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden text-foreground">
      {/* Skip Link for keyboard accessibility */}
      <a
        href="#main-editor"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
      >
        Skip to editor
      </a>

      {/* Sidebar Navigation */}
      <ConfigSidebar
        selectedId={selectedId}
        onSelect={handleSelectConfig}
        onNew={handleNew}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0" role="main" aria-label="Configuration Editor">
        {/* Toolbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card" role="banner">
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
            {/* Live region for screen reader announcements */}
            <div
              className="flex items-center gap-2 mr-4 px-3 py-1.5 rounded bg-background border border-border"
              role="status"
              aria-live="polite"
              aria-label="Validation status"
            >
              {validateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : isValid ? (
                <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
              )}
              <span className={cn(
                "text-xs font-medium",
                isValid ? "text-emerald-500" : "text-destructive"
              )}>
                {validateMutation.isPending ? "Validating..." : isValid ? "Valid Configuration" : `${errors.length} Errors Found`}
              </span>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSave}
                  disabled={!isDirty || !selectedId || updateMutation.isPending}
                  aria-label={`Save configuration${isDirty ? " (unsaved changes)" : ""}`}
                  className={cn(
                    "gap-2 transition-all",
                    isDirty ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{formatShortcut("S", { ctrl: true })}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Editor & Panel Layout */}
        <ResizablePanelGroup direction="horizontal" className="flex-1" aria-label="Editor and tools panels">
          <ResizablePanel defaultSize={60} minSize={30}>
            <section id="main-editor" className="h-full flex flex-col bg-[#1e1e1e]" aria-label="Code editor">
              <MonacoEditor
                value={content}
                onChange={(newContent) => {
                  setContent(newContent);
                  setIsDirty(true);
                }}
                errors={errors}
                className="flex-1"
              />
              
              {/* Validation Status Footer */}
              {!isValid && (
                <div
                  className="h-32 bg-destructive/10 border-t border-destructive/20 overflow-y-auto p-2"
                  role="alert"
                  aria-label={`${errors.length} validation errors`}
                >
                  <div className="flex items-center gap-2 mb-2 text-destructive font-semibold text-xs uppercase px-2">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Validation Errors
                  </div>
                  <ul className="space-y-1" aria-label="Error list">
                    {errors.map((err, i) => (
                      <li key={i} className="text-sm text-destructive-foreground/80 px-2 py-1 rounded hover:bg-destructive/20 cursor-pointer font-mono flex gap-2">
                        <span className="font-bold opacity-70">Line {err.line}:</span>
                        <span>{err.message}</span>
                        <span className="text-xs opacity-50 ml-auto border border-destructive/30 px-1 rounded" aria-label={`Error code ${err.code}`}>{err.code}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </ResizablePanel>
          
          <ResizableHandle withHandle className="bg-border" />
          
          <ResizablePanel defaultSize={40} minSize={20}>
            <aside className="h-full bg-card" role="complementary" aria-label="Tools and output">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <div className="border-b border-border px-4 bg-muted/30">
                  <TabsList className="bg-transparent h-12 p-0 gap-6" aria-label="Tool tabs">
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
                  <TestPanel configContent={content} configId={selectedId} />
                </TabsContent>

                <TabsContent value="preview" className="flex-1 m-0 p-0 overflow-auto">
                  <Workbench
                    configContent={content}
                    parsedConfig={validateMutation.data?.parsed}
                  />
                </TabsContent>

                <TabsContent value="validation" className="flex-1 m-0 p-0 overflow-hidden bg-[#1e1e1e]">
                  <div
                    className="p-4 h-full overflow-auto text-xs font-mono text-green-400/90 whitespace-pre"
                    role="region"
                    aria-label="Parsed JSON output"
                  >
                    {validateMutation.data?.parsed
                      ? JSON.stringify(validateMutation.data.parsed, null, 2)
                      : <span className="text-muted-foreground">// No valid parse result available</span>
                    }
                  </div>
                </TabsContent>
              </Tabs>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
