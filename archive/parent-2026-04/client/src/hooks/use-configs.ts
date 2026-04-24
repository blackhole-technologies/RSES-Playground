import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertConfig, type Config } from "@shared/schema";

// === Configs CRUD ===

export function useConfigs() {
  return useQuery({
    queryKey: [api.configs.list.path],
    queryFn: async () => {
      const res = await fetch(api.configs.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch configs");
      return api.configs.list.responses[200].parse(await res.json());
    },
  });
}

export function useConfig(id: number | null) {
  return useQuery({
    queryKey: [api.configs.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.configs.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch config");
      return api.configs.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertConfig) => {
      const res = await fetch(api.configs.create.path, {
        method: api.configs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.configs.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create config");
      }
      return api.configs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.configs.list.path] });
    },
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertConfig>) => {
      const url = buildUrl(api.configs.update.path, { id });
      const res = await fetch(url, {
        method: api.configs.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update config");
      return api.configs.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.configs.list.path] });
    },
  });
}

export function useDeleteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.configs.delete.path, { id });
      const res = await fetch(url, {
        method: api.configs.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete config");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.configs.list.path] });
    },
  });
}

// === Engine Operations ===

export function useValidateConfig() {
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(api.engine.validate.path, {
        method: api.engine.validate.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Validation request failed");
      return api.engine.validate.responses[200].parse(await res.json());
    },
  });
}

export function useTestConfig() {
  return useMutation({
    mutationFn: async (data: { configContent: string; filename: string; attributes?: Record<string, string> }) => {
      const res = await fetch(api.engine.test.path, {
        method: api.engine.test.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Test request failed");
      return api.engine.test.responses[200].parse(await res.json());
    },
  });
}
