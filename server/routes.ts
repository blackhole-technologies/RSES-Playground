import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { RsesParser } from "./lib/rses";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // === Configs CRUD ===

  app.get(api.configs.list.path, async (req, res) => {
    const configs = await storage.getConfigs();
    res.json(configs);
  });

  app.get(api.configs.get.path, async (req, res) => {
    const config = await storage.getConfig(Number(req.params.id));
    if (!config) {
      return res.status(404).json({ message: 'Config not found' });
    }
    res.json(config);
  });

  app.post(api.configs.create.path, async (req, res) => {
    try {
      const input = api.configs.create.input.parse(req.body);
      const config = await storage.createConfig(input);
      res.status(201).json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.configs.update.path, async (req, res) => {
    try {
      const input = api.configs.update.input.parse(req.body);
      const config = await storage.updateConfig(Number(req.params.id), input);
      if (!config) {
        return res.status(404).json({ message: 'Config not found' });
      }
      res.json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.configs.delete.path, async (req, res) => {
    await storage.deleteConfig(Number(req.params.id));
    res.status(204).send();
  });

  // === Engine Routes ===

  app.post(api.engine.validate.path, (req, res) => {
    try {
      const { content } = api.engine.validate.input.parse(req.body);
      const result = RsesParser.parse(content);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal parser error" });
    }
  });

  app.post(api.engine.test.path, (req, res) => {
    try {
      const { configContent, filename, attributes } = api.engine.test.input.parse(req.body);
      const parseResult = RsesParser.parse(configContent);
      
      if (!parseResult.valid || !parseResult.parsed) {
        return res.status(400).json({ message: "Config is invalid, cannot test" });
      }

      const result = RsesParser.test(parseResult.parsed, filename, attributes);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal engine error" });
    }
  });

  // Seed default config if empty
  await seedConfigs();

  return httpServer;
}

async function seedConfigs() {
  const existing = await storage.getConfigs();
  if (existing.length === 0) {
    const exampleConfig = `# Hybrid RSES Architecture Example
[defaults]
auto_topic = prefix
auto_type = suffix
delimiter = -

[overrides.topic]
util = tools-and-utilities
viz = visualizations
sacred-geo = sacred-geometry

[overrides.type]
lib = library
viz = visualization

[sets]
tools       = tool-*
quantum     = quantum-*
web         = web-* | webapp-*

[sets.attributes]
claude      = {source = claude}

[sets.compound]
claude-quantum = $quantum & $claude

[rules.topic]
$quantum & $claude -> quantum/claude

[rules.filetype]
*.py            -> code/python
*.js            -> code/javascript
*.ts            -> code/typescript
`;
    await storage.createConfig({
      name: "Default Example",
      content: exampleConfig,
      description: "A starter configuration based on the complete example."
    });
  }
}
