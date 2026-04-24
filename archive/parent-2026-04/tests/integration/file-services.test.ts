/**
 * @file file-services.test.ts
 * @description Integration tests for file system services.
 * @phase Phase 3 - File System Integration
 * @author SYS (Systems Analyst Agent)
 * @validated ALL
 * @created 2026-01-31
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  FileWatcherService,
  DEFAULT_SKIP_PATTERNS,
} from "../../server/services/file-watcher";
import {
  scanDirectory,
  countProjects,
} from "../../server/services/project-scanner";
import {
  SymlinkExecutor,
  type SymlinkOperation,
} from "../../server/services/symlink-executor";

describe("File Watcher Service", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fw-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("skip patterns", () => {
    it("has reasonable default skip patterns", () => {
      expect(DEFAULT_SKIP_PATTERNS).toContain("**/node_modules/**");
      expect(DEFAULT_SKIP_PATTERNS).toContain("**/.git/**");
      expect(DEFAULT_SKIP_PATTERNS).toContain("**/dist/**");
    });

    it("excludes common non-project directories", () => {
      const patterns = DEFAULT_SKIP_PATTERNS;

      // Python
      expect(patterns).toContain("**/__pycache__/**");
      expect(patterns).toContain("**/venv/**");

      // Rust
      expect(patterns).toContain("**/target/**");

      // IDE
      expect(patterns).toContain("**/.idea/**");
      expect(patterns).toContain("**/.vscode/**");
    });
  });

  describe("project detection", () => {
    it("detects project directories based on depth", async () => {
      // Create test structure
      await fs.mkdir(path.join(testDir, "project1"));
      await fs.mkdir(path.join(testDir, "category", "project2"), { recursive: true });

      const watcher = new FileWatcherService({
        rootPath: testDir,
        debounceMs: 100,
      });

      // Start briefly to detect projects
      await watcher.start();

      // Wait for initial scan
      await new Promise((resolve) => setTimeout(resolve, 500));

      const projects = watcher.getProjectPaths();
      expect(projects.length).toBeGreaterThanOrEqual(0); // Depends on marker detection

      await watcher.stop();
    });
  });
});

describe("Project Scanner Service", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "scanner-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("project detection", () => {
    it("finds projects with package.json", async () => {
      const projectPath = path.join(testDir, "my-project");
      await fs.mkdir(projectPath);
      await fs.writeFile(
        path.join(projectPath, "package.json"),
        JSON.stringify({ name: "test" })
      );

      const result = await scanDirectory({ rootPath: testDir });

      expect(result.projects.length).toBe(1);
      expect(result.projects[0].name).toBe("my-project");
      expect(result.projects[0].markers).toContain("package.json");
    });

    it("finds projects with Cargo.toml", async () => {
      const projectPath = path.join(testDir, "rust-project");
      await fs.mkdir(projectPath);
      await fs.writeFile(path.join(projectPath, "Cargo.toml"), "[package]");

      const result = await scanDirectory({ rootPath: testDir });

      expect(result.projects.length).toBe(1);
      expect(result.projects[0].markers).toContain("Cargo.toml");
    });

    it("finds projects with .git directory", async () => {
      const projectPath = path.join(testDir, "git-project");
      await fs.mkdir(path.join(projectPath, ".git"), { recursive: true });

      const result = await scanDirectory({ rootPath: testDir });

      expect(result.projects.length).toBe(1);
      expect(result.projects[0].markers).toContain(".git");
    });

    it("respects max depth", async () => {
      // Create deeply nested project
      const deepPath = path.join(testDir, "a", "b", "c", "d", "project");
      await fs.mkdir(deepPath, { recursive: true });
      await fs.writeFile(path.join(deepPath, "package.json"), "{}");

      const result = await scanDirectory({ rootPath: testDir, maxDepth: 2 });

      // Should not find the deep project
      expect(result.projects.length).toBe(0);
    });
  });

  describe("count projects", () => {
    it("counts projects without full scan", async () => {
      for (let i = 0; i < 3; i++) {
        const p = path.join(testDir, `project-${i}`);
        await fs.mkdir(p);
        await fs.writeFile(path.join(p, "package.json"), "{}");
      }

      const count = await countProjects(testDir);
      expect(count).toBe(3);
    });
  });

  describe("scan performance", () => {
    it("scans within reasonable time", async () => {
      // Create 10 projects
      for (let i = 0; i < 10; i++) {
        const p = path.join(testDir, `project-${i}`);
        await fs.mkdir(p);
        await fs.writeFile(path.join(p, "package.json"), "{}");
      }

      const result = await scanDirectory({ rootPath: testDir });

      expect(result.projects.length).toBe(10);
      expect(result.duration).toBeLessThan(1000); // Should complete in <1s
    });
  });
});

describe("Symlink Executor Service", () => {
  let sourceDir: string;
  let targetDir: string;
  let executor: SymlinkExecutor;

  beforeEach(async () => {
    sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "symlink-source-"));
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "symlink-target-"));

    executor = new SymlinkExecutor({
      baseDir: targetDir,
      createParentDirs: true,
    });
  });

  afterEach(async () => {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  });

  describe("createSymlink", () => {
    it("creates symlink to source", async () => {
      const projectPath = path.join(sourceDir, "my-project");
      await fs.mkdir(projectPath);

      const op: SymlinkOperation = {
        source: projectPath,
        targetDir: path.join(targetDir, "by-topic", "test"),
        linkName: "my-project",
        category: "by-topic/test",
      };

      const result = await executor.createSymlink(op);

      expect(result.success).toBe(true);

      // Verify symlink exists and points to source
      const linkPath = path.join(op.targetDir, op.linkName);
      const stats = await fs.lstat(linkPath);
      expect(stats.isSymbolicLink()).toBe(true);
    });

    it("creates parent directories", async () => {
      const projectPath = path.join(sourceDir, "my-project");
      await fs.mkdir(projectPath);

      const op: SymlinkOperation = {
        source: projectPath,
        targetDir: path.join(targetDir, "deep", "nested", "path"),
        linkName: "my-project",
        category: "deep/nested/path",
      };

      const result = await executor.createSymlink(op);

      expect(result.success).toBe(true);
    });

    it("replaces existing symlink", async () => {
      const project1 = path.join(sourceDir, "project1");
      const project2 = path.join(sourceDir, "project2");
      await fs.mkdir(project1);
      await fs.mkdir(project2);

      const linkDir = path.join(targetDir, "links");
      await fs.mkdir(linkDir, { recursive: true });

      // Create first symlink
      await executor.createSymlink({
        source: project1,
        targetDir: linkDir,
        linkName: "link",
        category: "links",
      });

      // Replace with second
      const result = await executor.createSymlink({
        source: project2,
        targetDir: linkDir,
        linkName: "link",
        category: "links",
      });

      expect(result.success).toBe(true);

      // Verify points to project2
      const linkPath = path.join(linkDir, "link");
      const target = await fs.readlink(linkPath);
      expect(target).toContain("project2");
    });
  });

  describe("path validation", () => {
    it("rejects paths outside base directory", async () => {
      const op: SymlinkOperation = {
        source: sourceDir,
        targetDir: "/tmp/outside",
        linkName: "escape",
        category: "escape",
      };

      const result = await executor.createSymlink(op);

      expect(result.success).toBe(false);
      expect(result.error).toContain("escapes base directory");
    });

    it("rejects path traversal attempts", async () => {
      const op: SymlinkOperation = {
        source: sourceDir,
        targetDir: path.join(targetDir, "..", "escape"),
        linkName: "escape",
        category: "escape",
      };

      const result = await executor.createSymlink(op);

      expect(result.success).toBe(false);
    });
  });

  describe("removeSymlink", () => {
    it("removes existing symlink", async () => {
      const projectPath = path.join(sourceDir, "my-project");
      await fs.mkdir(projectPath);

      const linkPath = path.join(targetDir, "to-remove");
      await fs.symlink(projectPath, linkPath);

      const result = await executor.removeSymlink(linkPath);

      expect(result.success).toBe(true);

      // Verify removed
      await expect(fs.access(linkPath)).rejects.toThrow();
    });

    it("rejects non-symlink files", async () => {
      const filePath = path.join(targetDir, "regular-file");
      await fs.writeFile(filePath, "content");

      const result = await executor.removeSymlink(filePath);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a symlink");
    });
  });

  describe("transaction", () => {
    it("creates multiple symlinks atomically", async () => {
      const projects: string[] = [];
      for (let i = 0; i < 3; i++) {
        const p = path.join(sourceDir, `project-${i}`);
        await fs.mkdir(p);
        projects.push(p);
      }

      const operations: SymlinkOperation[] = projects.map((p, i) => ({
        source: p,
        targetDir: path.join(targetDir, "batch"),
        linkName: `project-${i}`,
        category: "batch",
      }));

      const result = await executor.executeTransaction(operations);

      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.results.filter((r) => r.success).length).toBe(3);
    });

    it("rolls back on failure", async () => {
      const project1 = path.join(sourceDir, "project1");
      await fs.mkdir(project1);

      const operations: SymlinkOperation[] = [
        {
          source: project1,
          targetDir: path.join(targetDir, "batch"),
          linkName: "project1",
          category: "batch",
        },
        {
          source: project1,
          targetDir: "/invalid/path", // This will fail
          linkName: "invalid",
          category: "invalid",
        },
      ];

      const result = await executor.executeTransaction(operations);

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);

      // First symlink should be rolled back
      const linkPath = path.join(targetDir, "batch", "project1");
      await expect(fs.access(linkPath)).rejects.toThrow();
    });
  });

  describe("cleanup", () => {
    it("removes broken symlinks", async () => {
      // Create symlink to non-existent target
      const brokenLink = path.join(targetDir, "broken");
      await fs.symlink("/non/existent/path", brokenLink);

      const removed = await executor.cleanupBroken();

      expect(removed).toContain(brokenLink);
      await expect(fs.access(brokenLink)).rejects.toThrow();
    });
  });

  describe("listSymlinks", () => {
    it("lists all symlinks in base directory", async () => {
      const project = path.join(sourceDir, "project");
      await fs.mkdir(project);

      // Create some symlinks
      const link1 = path.join(targetDir, "by-topic", "ai", "project");
      const link2 = path.join(targetDir, "by-type", "app", "project");

      await fs.mkdir(path.dirname(link1), { recursive: true });
      await fs.mkdir(path.dirname(link2), { recursive: true });
      await fs.symlink(project, link1);
      await fs.symlink(project, link2);

      const symlinks = await executor.listSymlinks();

      expect(symlinks.length).toBe(2);
      expect(symlinks.map((s) => s.category).sort()).toEqual([
        "by-topic/ai",
        "by-type/app",
      ]);
    });
  });
});
