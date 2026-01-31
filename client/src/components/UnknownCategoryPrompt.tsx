/**
 * @file UnknownCategoryPrompt.tsx
 * @description Interactive dialog for handling unmatched filenames with suggestions
 * @phase Phase 5 - Prompting & Learning
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Lightbulb,
  Plus,
  Save,
  FileCode,
  ArrowRight,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion {
  value: string;
  confidence: number;
  reason: string;
  type: "set" | "topic" | "type" | "filetype";
}

interface UnknownCategoryPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  prefix: string;
  suffix: string;
  suggestions: Suggestion[];
  onApply: (result: {
    category: string;
    type: "set" | "topic" | "type" | "filetype";
    remember: boolean;
    addAsRule: boolean;
  }) => void;
  onSkip: () => void;
}

export function UnknownCategoryPrompt({
  open,
  onOpenChange,
  filename,
  prefix,
  suffix,
  suggestions,
  onApply,
  onSkip,
}: UnknownCategoryPromptProps) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [selectedType, setSelectedType] = useState<"set" | "topic" | "type">("topic");
  const [remember, setRemember] = useState(false);
  const [addAsRule, setAddAsRule] = useState(false);
  const [mode, setMode] = useState<"suggestions" | "custom">("suggestions");

  const handleApply = () => {
    if (mode === "suggestions" && selectedSuggestion) {
      onApply({
        category: selectedSuggestion.value,
        type: selectedSuggestion.type,
        remember,
        addAsRule,
      });
    } else if (mode === "custom" && customCategory.trim()) {
      onApply({
        category: customCategory.trim(),
        type: selectedType,
        remember,
        addAsRule,
      });
    }
    resetState();
  };

  const resetState = () => {
    setSelectedSuggestion(null);
    setCustomCategory("");
    setRemember(false);
    setAddAsRule(false);
    setMode("suggestions");
  };

  const handleSkip = () => {
    resetState();
    onSkip();
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) {
      return (
        <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          High
        </Badge>
      );
    } else if (confidence >= 0.5) {
      return (
        <Badge variant="default" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
          Medium
        </Badge>
      );
    } else {
      return (
        <Badge variant="default" className="bg-muted text-muted-foreground">
          Low
        </Badge>
      );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "set":
        return <FileCode className="h-3.5 w-3.5" />;
      case "topic":
        return <Lightbulb className="h-3.5 w-3.5" />;
      case "type":
        return <ArrowRight className="h-3.5 w-3.5" />;
      default:
        return <FileCode className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            No Category Match Found
          </DialogTitle>
          <DialogDescription>
            The filename <code className="text-primary font-mono">{filename}</code> didn&apos;t match
            any existing categories. Choose a suggestion or create a new one.
          </DialogDescription>
        </DialogHeader>

        {/* Filename analysis */}
        <div className="flex items-center gap-2 text-sm bg-muted/50 p-3 rounded-md">
          <span className="text-muted-foreground">Analyzed:</span>
          <Badge variant="outline" className="font-mono">
            prefix: {prefix || "(none)"}
          </Badge>
          {suffix && (
            <Badge variant="outline" className="font-mono">
              suffix: {suffix}
            </Badge>
          )}
        </div>

        {/* Mode tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setMode("suggestions")}
            className={cn(
              "flex-1 py-2 text-sm font-medium transition-colors",
              mode === "suggestions"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="inline h-4 w-4 mr-1.5" />
            Suggestions ({suggestions.length})
          </button>
          <button
            onClick={() => setMode("custom")}
            className={cn(
              "flex-1 py-2 text-sm font-medium transition-colors",
              mode === "custom"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Plus className="inline h-4 w-4 mr-1.5" />
            Create New
          </button>
        </div>

        {/* Content based on mode */}
        {mode === "suggestions" ? (
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-2 pr-4">
              {suggestions.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No suggestions available</p>
                  <p className="text-xs">Try creating a new category</p>
                </div>
              ) : (
                suggestions.map((suggestion, i) => (
                  <button
                    key={`${suggestion.type}-${suggestion.value}-${i}`}
                    onClick={() => setSelectedSuggestion(suggestion)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
                      selectedSuggestion === suggestion
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "p-1.5 rounded-md",
                          selectedSuggestion === suggestion
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {getTypeIcon(suggestion.type)}
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {suggestion.value}
                          <Badge variant="outline" className="text-xs capitalize">
                            {suggestion.type}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {suggestion.reason}
                        </div>
                      </div>
                    </div>
                    {getConfidenceBadge(suggestion.confidence)}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-category">Category Name</Label>
              <Input
                id="custom-category"
                placeholder="e.g., web-development"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Category Type</Label>
              <div className="flex gap-2">
                {(["topic", "type", "set"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={selectedType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedType(type)}
                    className="capitalize"
                  >
                    {getTypeIcon(type)}
                    <span className="ml-1.5">{type}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <Label
              htmlFor="remember"
              className="text-sm font-normal cursor-pointer"
            >
              Remember this choice for similar filenames
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="add-rule"
              checked={addAsRule}
              onCheckedChange={(checked) => setAddAsRule(checked === true)}
            />
            <Label
              htmlFor="add-rule"
              className="text-sm font-normal cursor-pointer"
            >
              Add as a new rule in the configuration
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              (mode === "suggestions" && !selectedSuggestion) ||
              (mode === "custom" && !customCategory.trim())
            }
          >
            <Save className="h-4 w-4 mr-2" />
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
