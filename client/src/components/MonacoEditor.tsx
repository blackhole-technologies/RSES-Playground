import { useRef, useCallback } from "react";
import Editor, { OnMount, OnChange, Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { registerRsesLanguage, RSES_LANGUAGE_ID } from "@/lib/monaco-rses";

interface ValidationError {
  line: number;
  message: string;
  code?: string;
}

interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: ValidationError[];
  className?: string;
  placeholder?: string;
}

export function MonacoEditor({
  value,
  onChange,
  errors = [],
  className,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register RSES language on first mount
    registerRsesLanguage(monaco);

    // Apply theme
    monaco.editor.setTheme("rses-dark");

    // Focus the editor
    editor.focus();
  }, []);

  const handleChange: OnChange = useCallback(
    (newValue) => {
      if (newValue !== undefined) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  // Update error markers when errors change
  const updateMarkers = useCallback(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: editor.IMarkerData[] = errors.map((err) => ({
      severity: monacoRef.current!.MarkerSeverity.Error,
      message: `${err.message}${err.code ? ` [${err.code}]` : ""}`,
      startLineNumber: err.line,
      startColumn: 1,
      endLineNumber: err.line,
      endColumn: model.getLineMaxColumn(err.line),
    }));

    monacoRef.current.editor.setModelMarkers(model, "rses-validator", markers);
  }, [errors]);

  // Update markers when errors change
  // We use onMount and a manual call pattern to avoid stale closure issues
  if (editorRef.current && monacoRef.current) {
    updateMarkers();
  }

  return (
    <div className={className} role="textbox" aria-label="RSES Configuration Editor">
      <Editor
        height="100%"
        defaultLanguage={RSES_LANGUAGE_ID}
        language={RSES_LANGUAGE_ID}
        value={value}
        onChange={handleChange}
        onMount={handleEditorMount}
        theme="rses-dark"
        options={{
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          lineNumbers: "on",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          folding: true,
          foldingStrategy: "auto",
          glyphMargin: true,
          lineDecorationsWidth: 10,
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
          padding: { top: 16, bottom: 16 },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: "auto",
            horizontal: "auto",
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          // Accessibility
          accessibilitySupport: "auto",
          ariaLabel: "RSES Configuration Editor",
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-muted-foreground">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
