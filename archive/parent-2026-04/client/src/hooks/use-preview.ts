import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";

export interface PreviewResult {
  derivedAttributes: Record<string, string>;
  combinedAttributes: Record<string, string>;
  matchedSets: string[];
  symlinks: Array<{
    type: 'topic' | 'type';
    name: string;
    target: string;
    category: string;
  }>;
  parsed?: unknown;
}

export function usePreview() {
  return useMutation({
    mutationFn: async (data: {
      configContent: string;
      testPath: string;
      manualAttributes?: Record<string, string>;
    }): Promise<PreviewResult> => {
      const res = await fetch(api.engine.preview.path, {
        method: api.engine.preview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Preview request failed");
      }
      return api.engine.preview.responses[200].parse(await res.json());
    },
  });
}
