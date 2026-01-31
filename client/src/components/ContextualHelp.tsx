/**
 * @file ContextualHelp.tsx
 * @description Contextual help system with tooltips and inline documentation
 * @phase Phase 5 - Prompting & Learning
 */

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { HelpCircle, BookOpen, Lightbulb, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { helpText, errorCodes, getErrorInfo } from "@shared/prompts";

interface HelpButtonProps {
  section?: keyof typeof helpText.sections;
  className?: string;
}

/**
 * Inline help button with tooltip popover
 */
export function HelpButton({ section, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  const sectionHelp = section ? helpText.sections[section] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6 text-muted-foreground hover:text-foreground", className)}
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-medium">Help</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {sectionHelp || "Click for contextual help on this section."}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface HelpPanelProps {
  section: "editor" | "testPlayground" | "workbench";
  className?: string;
}

/**
 * Full help panel with tips and documentation links
 */
export function HelpPanel({ section, className }: HelpPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const content = helpText[section];

  if (!content) return null;

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setIsOpen(!isOpen)}
      >
        <HelpCircle className="h-4 w-4 mr-1" />
        Help
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-popover border rounded-lg shadow-lg z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                {content.title}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {content.description}
            </p>

            <Separator className="my-3" />

            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                <Lightbulb className="h-3 w-3" />
                Tips
              </h4>
              <ul className="space-y-2">
                {content.tips.map((tip, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ErrorHelpProps {
  code: string;
  className?: string;
}

/**
 * Error-specific help with fix suggestions
 */
export function ErrorHelp({ code, className }: ErrorHelpProps) {
  const [open, setOpen] = useState(false);
  const errorInfo = getErrorInfo(code);

  if (!errorInfo) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-5 px-1.5 text-xs text-destructive hover:text-destructive", className)}
        >
          <HelpCircle className="h-3 w-3 mr-1" />
          {code}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" side="right">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-destructive flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-destructive/10 rounded text-xs font-mono">
                  {errorInfo.code}
                </span>
                {errorInfo.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {errorInfo.description}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                How to Fix
              </h4>
              <p className="text-sm">{errorInfo.fix}</p>
            </div>

            {errorInfo.example && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Example</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-destructive/5 rounded border border-destructive/20">
                      <div className="text-xs text-destructive mb-1">Before:</div>
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                        {errorInfo.example.before}
                      </pre>
                    </div>
                    <div className="p-2 bg-emerald-500/5 rounded border border-emerald-500/20">
                      <div className="text-xs text-emerald-500 mb-1">After:</div>
                      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                        {errorInfo.example.after}
                      </pre>
                    </div>
                  </div>
                </div>
              </>
            )}

            {errorInfo.learnMoreUrl && (
              <a
                href={errorInfo.learnMoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Learn more
              </a>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Section header with help button
 */
export function SectionWithHelp({
  title,
  section,
  children,
}: {
  title: string;
  section: keyof typeof helpText.sections;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-medium">{title}</span>
        <HelpButton section={section} />
      </div>
      {children}
    </div>
  );
}
