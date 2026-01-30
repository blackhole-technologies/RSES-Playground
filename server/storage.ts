import { db } from "./db";
import { configs, type InsertConfig, type Config } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getConfigs(): Promise<Config[]>;
  getConfig(id: number): Promise<Config | undefined>;
  createConfig(config: InsertConfig): Promise<Config>;
  updateConfig(id: number, updates: Partial<InsertConfig>): Promise<Config>;
  deleteConfig(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getConfigs(): Promise<Config[]> {
    return await db.select().from(configs).orderBy(desc(configs.createdAt));
  }

  async getConfig(id: number): Promise<Config | undefined> {
    const [config] = await db.select().from(configs).where(eq(configs.id, id));
    return config;
  }

  async createConfig(insertConfig: InsertConfig): Promise<Config> {
    const [config] = await db.insert(configs).values(insertConfig).returning();
    return config;
  }

  async updateConfig(id: number, updates: Partial<InsertConfig>): Promise<Config> {
    const [config] = await db
      .update(configs)
      .set(updates)
      .where(eq(configs.id, id))
      .returning();
    return config;
  }

  async deleteConfig(id: number): Promise<void> {
    await db.delete(configs).where(eq(configs.id, id));
  }
}

export const storage = new DatabaseStorage();
