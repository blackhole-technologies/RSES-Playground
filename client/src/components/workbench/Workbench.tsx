import { useState, useEffect, useMemo, useCallback } from "react";
import { usePreview, type PreviewResult } from "@/hooks/use-preview";
import { useAutolinkProject, type AutolinkResponse } from "@/hooks/use-autolink";
import { cn } from "@/lib/utils";
import "./workbench.css";

interface WorkbenchProps {
  configContent: string;
  parsedConfig?: {
    sets: Record<string, string>;
    attributes: Record<string, string>;
    compound: Record<string, string>;
    rules: {
      topic: Array<{ condition: string; result: string; line: number }>;
      type: Array<{ condition: string; result: string; line: number }>;
      filetype: Array<{ condition: string; result: string; line: number }>;
    };
  };
}

interface Message {
  type: 'user' | 'system';
  text: string;
}

// Debounce hook
function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Derive attributes from path
function deriveAttributesFromPath(filepath: string): Record<string, string> {
  const parts = filepath.split('/').filter(Boolean);
  const derived: Record<string, string> = {};
  if (parts[0] === 'by-ai' && parts.length >= 2) {
    derived.source = parts[1];
  }
  return derived;
}

// Mock file structure based on path
function getFilesForPath(path: string): Array<{ name: string; type: string }> {
  const projectName = path.split('/').filter(Boolean).pop() || 'project';
  return [
    { name: 'src/', type: 'folder' },
    { name: 'README.md', type: 'md' },
    { name: 'package.json', type: 'json' },
    { name: `${projectName}.config.ts`, type: 'ts' },
  ];
}

export function Workbench({ configContent, parsedConfig }: WorkbenchProps) {
  const [testPath, setTestPath] = useState("by-ai/claude/quantum-app");
  const [evalExpr, setEvalExpr] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { type: 'user', text: 'Load workbench with test path' },
    { type: 'system', text: 'Workbench initialized. Enter a path to test RSES rules and see generated symlinks.' },
  ]);
  const [inputValue, setInputValue] = useState("");

  const previewMutation = usePreview();
  const autolinkMutation = useAutolinkProject();
  const debouncedConfig = useDebounceValue(configContent, 500);
  const debouncedPath = useDebounceValue(testPath, 300);

  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [lastAutolinkResult, setLastAutolinkResult] = useState<AutolinkResponse | null>(null);

  // Auto-trigger preview
  useEffect(() => {
    if (debouncedConfig && debouncedPath) {
      previewMutation.mutate(
        { configContent: debouncedConfig, testPath: debouncedPath },
        { onSuccess: (data) => setPreviewResult(data) }
      );
    }
  }, [debouncedConfig, debouncedPath]);

  // Parse path into breadcrumbs
  const pathParts = testPath.split('/').filter(Boolean);
  const projectName = pathParts[pathParts.length - 1] || testPath;
  const derivedAttrs = deriveAttributesFromPath(testPath);

  // Mock files
  const files = getFilesForPath(testPath);

  // Combine all sets for display
  const allSets = useMemo(() => {
    if (!parsedConfig) return [];
    const sets: Array<{ name: string; expr: string; type: 'pattern' | 'attribute' | 'compound' }> = [];

    Object.entries(parsedConfig.sets).forEach(([name, expr]) => {
      sets.push({ name, expr, type: 'pattern' });
    });
    Object.entries(parsedConfig.attributes).forEach(([name, expr]) => {
      sets.push({ name, expr, type: 'attribute' });
    });
    Object.entries(parsedConfig.compound).forEach(([name, expr]) => {
      sets.push({ name, expr, type: 'compound' });
    });

    return sets;
  }, [parsedConfig]);

  // Combine all rules
  const allRules = useMemo(() => {
    if (!parsedConfig) return [];
    const rules: Array<{ type: string; condition: string; result: string }> = [];

    parsedConfig.rules.topic.forEach(r => rules.push({ type: 'topic', condition: r.condition, result: r.result }));
    parsedConfig.rules.type.forEach(r => rules.push({ type: 'type', condition: r.condition, result: r.result }));
    parsedConfig.rules.filetype.forEach(r => rules.push({ type: 'filetype', condition: r.condition, result: r.result }));

    return rules;
  }, [parsedConfig]);

  // Action handlers
  const addMessage = useCallback((type: 'user' | 'system', text: string) => {
    setMessages(prev => [...prev, { type, text }]);
  }, []);

  const handleAutolink = useCallback(async (dryRun = false) => {
    if (!configContent) {
      addMessage('system', 'Error: No config content available');
      return;
    }

    addMessage('user', dryRun ? '[Preview Autolink]' : '[Autolink]');

    try {
      const result = await autolinkMutation.mutateAsync({
        projectPath: testPath,
        configContent,
        dryRun,
      });

      setLastAutolinkResult(result);

      if (result.success) {
        const createdCount = result.symlinks.filter(s => s.created || dryRun).length;
        if (createdCount > 0) {
          addMessage('system', `${dryRun ? 'Would create' : 'Created'} ${createdCount} symlink(s) for ${result.projectName}:`);
          result.symlinks.forEach(link => {
            if (link.created || dryRun) {
              addMessage('system', `  -> ${link.category}`);
            }
          });
        } else {
          addMessage('system', `No symlinks ${dryRun ? 'would be' : 'were'} created (no matching rules)`);
        }

        if (result.classification.sets.length > 0) {
          addMessage('system', `Matched sets: ${result.classification.sets.map(s => `$${s}`).join(', ')}`);
        }
      } else {
        addMessage('system', `Autolink failed: ${result.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addMessage('system', `Error: ${errorMsg}`);
    }
  }, [configContent, testPath, autolinkMutation, addMessage]);

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case 'autolink':
        handleAutolink(false);
        break;
      case 'preview':
        handleAutolink(true);
        break;
      case 'new-folder':
        if (inputValue) {
          addMessage('user', `[New Folder] ${inputValue}`);
          addMessage('system', `Created folder: ${inputValue}/`);
          setInputValue("");
        }
        break;
      case 'new-file':
        if (inputValue) {
          addMessage('user', `[New File] ${inputValue}`);
          addMessage('system', `Created file: ${inputValue}`);
          setInputValue("");
        }
        break;
      case 'delete':
        if (inputValue) {
          addMessage('user', `[Delete] ${inputValue}`);
          addMessage('system', `Deleted: ${inputValue}`);
          setInputValue("");
        }
        break;
      case 'rename':
        if (inputValue) {
          addMessage('user', `[Rename] ${inputValue}`);
          addMessage('system', `Renamed: ${inputValue}`);
          setInputValue("");
        }
        break;
      case 'eval':
        if (evalExpr) {
          addMessage('user', `[Eval] ${evalExpr}`);
          const matched = previewResult?.matchedSets.filter(s =>
            evalExpr.includes(`$${s}`) || evalExpr === `$${s}`
          ) || [];
          addMessage('system', `Evaluated ${evalExpr}: ${matched.length > 0 ? matched.map(s => `$${s}`).join(', ') : 'no matches'}`);
        }
        break;
    }
  }, [inputValue, evalExpr, previewResult, addMessage, handleAutolink]);

  return (
    <div className="workbench">
      {/* BREADCRUMBS */}
      <nav className="wb-breadcrumbs">
        {pathParts.map((part, i) => (
          <span key={i} className={cn("wb-crumb", i === pathParts.length - 1 && "current")}>
            {i === 0 ? part : i === 1 ? part : `in ${part}`}
          </span>
        ))}
      </nav>

      {/* FILES */}
      <section className="wb-section">
        <h2>Files</h2>
        <ul className="wb-file-list">
          {files.map((file, i) => (
            <li key={i} className="wb-file" data-type={file.type}>
              {file.name}
            </li>
          ))}
        </ul>
      </section>

      {/* SYMLINKS */}
      <section className="wb-section">
        <h2>Symlinks</h2>
        <p className="wb-note">Generated by RSES rules. Run [Autolink] to create.</p>
        {previewResult && previewResult.symlinks.length > 0 ? (
          <ul className="wb-symlink-list">
            {previewResult.symlinks.map((link, i) => (
              <li key={i} className="wb-symlink">
                <span className="wb-link-name">{link.name}</span>
                <span className="wb-link-arrow">→</span>
                <span className="wb-link-target">{link.target}</span>
                <span className="wb-link-category">in {link.category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="wb-empty">No symlinks generated</div>
        )}
      </section>

      {/* SETS */}
      <section className="wb-section">
        <h2>Sets</h2>
        <p className="wb-note">Defined in config. Matched sets highlighted.</p>
        {allSets.length > 0 ? (
          <table className="wb-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Expression</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {allSets.map((set, i) => {
                const isMatched = previewResult?.matchedSets.includes(set.name);
                return (
                  <tr key={i} className={cn(isMatched && "wb-matched")}>
                    <td className="wb-set-name">${set.name}</td>
                    <td className="wb-set-expr">{set.expr}</td>
                    <td className="wb-set-type">{set.type}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="wb-empty">No sets defined</div>
        )}
      </section>

      {/* RULES */}
      <section className="wb-section">
        <h2>Rules</h2>
        <p className="wb-note">Map expressions to categories</p>
        {allRules.length > 0 ? (
          <table className="wb-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Condition</th>
                <th></th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {allRules.map((rule, i) => (
                <tr key={i}>
                  <td className="wb-rule-type">{rule.type}</td>
                  <td className="wb-rule-expr">{rule.condition}</td>
                  <td className="wb-rule-arrow">→</td>
                  <td className="wb-rule-result">{rule.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="wb-empty">No rules defined</div>
        )}
      </section>

      {/* EVAL */}
      <section className="wb-section">
        <h2>Eval</h2>
        <p className="wb-note">Test expressions interactively</p>
        <div className="wb-eval-input">
          <input
            type="text"
            value={evalExpr}
            onChange={(e) => setEvalExpr(e.target.value)}
            placeholder="Enter expression: $tools, quantum-*, $claude & $web"
            onKeyDown={(e) => e.key === 'Enter' && handleAction('eval')}
          />
          <button onClick={() => handleAction('eval')} className="wb-button">Eval</button>
        </div>
        <div className="wb-eval-results">
          {previewResult ? (
            <>
              <div className="wb-eval-query">
                Testing: <code>{projectName}</code> with attributes: <code>{JSON.stringify(previewResult.combinedAttributes)}</code>
              </div>
              <div className="wb-eval-matched">
                <strong>Matched sets:</strong>
                {previewResult.matchedSets.length > 0 ? (
                  previewResult.matchedSets.map((s, i) => (
                    <span key={i} className="wb-matched-set">${s}</span>
                  ))
                ) : (
                  <span className="wb-no-match">none</span>
                )}
              </div>
              <div className="wb-eval-count">
                {previewResult.matchedSets.length} set(s) matched
              </div>
            </>
          ) : (
            <div className="wb-eval-placeholder">Enter a path above to see results</div>
          )}
        </div>
        <details className="wb-eval-help">
          <summary>Expression syntax</summary>
          <ul>
            <li><code>$name</code> - Reference a named set</li>
            <li><code>pattern</code> - Glob pattern (e.g., tool-*, *-lib)</li>
            <li><code>E1 | E2</code> - Union (projects in E1 OR E2)</li>
            <li><code>E1 &amp; E2</code> - Intersection (projects in E1 AND E2)</li>
            <li><code>{'{attr = value}'}</code> - Attribute match</li>
            <li><code>{'{attr = *}'}</code> - Wildcard attribute</li>
          </ul>
        </details>
      </section>

      {/* ACTIONS */}
      <section className="wb-section">
        <h2>Actions</h2>
        <div className="wb-action-group">
          <button className="wb-button" onClick={() => handleAction('new-folder')}>New Folder</button>
          <button className="wb-button" onClick={() => handleAction('new-file')}>New File</button>
          <button className="wb-button wb-danger" onClick={() => handleAction('delete')}>Delete</button>
          <button className="wb-button" onClick={() => handleAction('rename')}>Rename</button>
        </div>
        <div className="wb-action-group">
          <button
            className="wb-button wb-primary"
            onClick={() => handleAction('autolink')}
            disabled={autolinkMutation.isPending}
          >
            {autolinkMutation.isPending ? 'Linking...' : 'Autolink'}
          </button>
          <button
            className="wb-button"
            onClick={() => handleAction('preview')}
            disabled={autolinkMutation.isPending}
          >
            Preview
          </button>
        </div>
        <p className="wb-note">Autolink creates symlinks in <code>~/search-results/</code> based on RSES rules.</p>
        {lastAutolinkResult && (
          <p className="wb-note wb-success">
            Last autolink: {lastAutolinkResult.symlinks.filter(s => s.created).length} symlinks created
            for {lastAutolinkResult.projectName}
          </p>
        )}
      </section>

      {/* INPUT */}
      <section className="wb-section">
        <label className="wb-label">Name / Argument:</label>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="wb-input"
          placeholder="Enter filename, folder name, or value..."
        />
      </section>

      {/* PATH INPUT */}
      <section className="wb-section">
        <label className="wb-label">Test Path:</label>
        <input
          type="text"
          value={testPath}
          onChange={(e) => setTestPath(e.target.value)}
          className="wb-input"
          placeholder="by-ai/claude/project-name"
        />
        {Object.keys(derivedAttrs).length > 0 && (
          <p className="wb-note">
            ✨ Auto-derived: {Object.entries(derivedAttrs).map(([k, v]) => `${k}=${v}`).join(', ')}
          </p>
        )}
      </section>

      {/* CONVERSATION */}
      <section className="wb-section">
        <h2>Conversation</h2>
        <div className="wb-messages">
          {messages.map((msg, i) => (
            <p key={i} className={cn("wb-message", msg.type === 'user' ? "wb-user" : "wb-system")}>
              {msg.text}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}
