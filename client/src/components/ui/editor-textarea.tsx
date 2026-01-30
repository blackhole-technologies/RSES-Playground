import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface EditorTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  errors?: Array<{ line: number; message: string }>;
}

export function EditorTextarea({ value, onChange, className, errors = [], ...props }: EditorTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Calculate line count for line numbers
  const lines = value.split("\n");
  const lineCount = lines.length;

  return (
    <div className={cn("relative flex h-full w-full font-mono text-sm leading-6", className)}>
      {/* Line Numbers Column */}
      <div className="flex-none w-12 bg-card/50 text-muted-foreground/50 text-right pr-3 pt-4 select-none border-r border-border overflow-hidden">
        {Array.from({ length: Math.max(lineCount, 1) }).map((_, i) => (
          <div 
            key={i} 
            className={cn(
              "h-6 flex items-center justify-end transition-colors",
              errors.some(e => e.line === i + 1) && "text-destructive font-bold bg-destructive/10"
            )}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Actual Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        spellCheck={false}
        className="flex-1 resize-none bg-transparent p-4 outline-none border-none text-foreground placeholder:text-muted-foreground/30 leading-6"
        style={{ tabSize: 2 }}
        {...props}
      />

      {/* Error Markers Overlay (absolute positioned on the right) */}
      <div className="absolute top-4 right-2 bottom-4 w-4 pointer-events-none">
         {errors.map((err, idx) => {
           // Simple estimation of position based on line number
           // 1.5rem (24px) is the line height used in CSS above
           return (
             <div 
               key={idx}
               className="absolute w-3 h-3 rounded-full bg-destructive shadow-md shadow-destructive/20"
               style={{ top: `${(err.line - 1) * 1.5 + 0.35}rem` }}
               title={err.message}
             />
           );
         })}
      </div>
    </div>
  );
}
