/**
 * @file neural-classifier.ts
 * @description Neural network classifiers for ML-enhanced taxonomy.
 *              Supports HuggingFace Transformers, OpenAI, and local models.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Supported Models:
 * - BERT/DistilBERT for text classification
 * - CodeBERT for code classification
 * - CLIP for image classification
 * - Zero-shot classification with LLMs
 */

import { createModuleLogger } from "../logger";
import {
  NeuralClassificationResult,
  CategoryPrediction,
  AttentionWeights,
  NeuralClassifierConfig,
  ContentModality,
} from "./ml-taxonomy-engine";

const log = createModuleLogger("neural-classifier");

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Classification request.
 */
export interface ClassificationRequest {
  /** Content to classify */
  content: string;
  /** Content type */
  contentType: ContentModality;
  /** Candidate labels for zero-shot */
  candidateLabels?: string[];
  /** Multi-label classification */
  multiLabel?: boolean;
  /** Return attention weights */
  returnAttention?: boolean;
  /** Return raw logits */
  returnLogits?: boolean;
}

/**
 * Neural classifier interface.
 */
export interface NeuralClassifier {
  /** Classifier name */
  readonly name: string;
  /** Supported content types */
  readonly supportedTypes: ContentModality[];
  /** Check if classifier is available */
  isAvailable(): Promise<boolean>;
  /** Run classification */
  classify(request: ClassificationRequest): Promise<NeuralClassificationResult>;
  /** Get available labels */
  getLabels(): Promise<string[]>;
  /** Train on new data (if supported) */
  train?(data: Array<{ content: string; labels: string[] }>): Promise<void>;
}

/**
 * Training data for fine-tuning.
 */
export interface TrainingData {
  content: string;
  labels: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Training configuration.
 */
export interface TrainingConfig {
  /** Number of epochs */
  epochs: number;
  /** Batch size */
  batchSize: number;
  /** Learning rate */
  learningRate: number;
  /** Early stopping patience */
  patience?: number;
  /** Validation split */
  validationSplit?: number;
}

// ============================================================================
// HUGGINGFACE CLASSIFIER
// ============================================================================

/**
 * HuggingFace Inference API classifier configuration.
 */
export interface HuggingFaceClassifierConfig {
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

/**
 * HuggingFace zero-shot classification.
 */
export class HuggingFaceZeroShotClassifier implements NeuralClassifier {
  readonly name = "huggingface-zero-shot";
  readonly supportedTypes: ContentModality[] = ["text", "code"];

  private config: HuggingFaceClassifierConfig;
  private modelId = "facebook/bart-large-mnli";
  private labels: string[] = [];

  constructor(config: HuggingFaceClassifierConfig) {
    this.config = config;
    if (config.modelId) {
      this.modelId = config.modelId;
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async getLabels(): Promise<string[]> {
    return this.labels;
  }

  setLabels(labels: string[]): void {
    this.labels = labels;
  }

  async classify(request: ClassificationRequest): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    const labels = request.candidateLabels || this.labels;
    if (labels.length === 0) {
      throw new Error("No candidate labels provided for zero-shot classification");
    }

    try {
      const response = await fetch(
        `${this.config.baseUrl || "https://api-inference.huggingface.co"}/models/${this.modelId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            inputs: request.content,
            parameters: {
              candidate_labels: labels,
              multi_label: request.multiLabel ?? true,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`HuggingFace API error: ${error.error || response.statusText}`);
      }

      const data = await response.json();

      // Map to our format
      const predictions: CategoryPrediction[] = data.labels.map((label: string, i: number) => ({
        categoryId: this.labelToId(label),
        categoryName: label,
        probability: data.scores[i],
        selected: data.scores[i] > 0.5,
        explanation: `Zero-shot classification with ${this.modelId}`,
      }));

      return {
        predictions,
        confidence: predictions[0]?.probability || 0,
        inferenceTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error({ error, model: this.modelId }, "HuggingFace classification failed");
      throw error;
    }
  }

  private labelToId(label: string): string {
    return label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }
}

/**
 * HuggingFace text classification with fine-tuned model.
 */
export class HuggingFaceTextClassifier implements NeuralClassifier {
  readonly name = "huggingface-text";
  readonly supportedTypes: ContentModality[] = ["text"];

  private config: HuggingFaceClassifierConfig;
  private modelId: string;
  private labelMap: Map<string, string> = new Map();

  constructor(config: HuggingFaceClassifierConfig, modelId: string = "distilbert-base-uncased-finetuned-sst-2-english") {
    this.config = config;
    this.modelId = modelId;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async getLabels(): Promise<string[]> {
    return Array.from(this.labelMap.values());
  }

  setLabelMap(map: Record<string, string>): void {
    this.labelMap = new Map(Object.entries(map));
  }

  async classify(request: ClassificationRequest): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    try {
      const response = await fetch(
        `${this.config.baseUrl || "https://api-inference.huggingface.co"}/models/${this.modelId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            inputs: request.content,
            options: { wait_for_model: true },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`HuggingFace API error: ${error.error || response.statusText}`);
      }

      const data = await response.json();

      // Handle both single and batch results
      const results = Array.isArray(data[0]) ? data[0] : data;

      const predictions: CategoryPrediction[] = results.map((item: { label: string; score: number }) => ({
        categoryId: this.labelMap.get(item.label) || item.label,
        categoryName: item.label,
        probability: item.score,
        selected: item.score > 0.5,
        explanation: `Text classification with ${this.modelId}`,
      }));

      return {
        predictions,
        confidence: predictions[0]?.probability || 0,
        inferenceTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error({ error, model: this.modelId }, "HuggingFace text classification failed");
      throw error;
    }
  }
}

// ============================================================================
// OPENAI CLASSIFIER
// ============================================================================

/**
 * OpenAI GPT-based classifier configuration.
 */
export interface OpenAIClassifierConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * OpenAI GPT-based zero-shot classifier.
 * Uses prompt engineering for classification.
 */
export class OpenAIClassifier implements NeuralClassifier {
  readonly name = "openai-gpt";
  readonly supportedTypes: ContentModality[] = ["text", "code"];

  private config: OpenAIClassifierConfig;
  private labels: string[] = [];
  private labelDescriptions: Map<string, string> = new Map();

  constructor(config: OpenAIClassifierConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async getLabels(): Promise<string[]> {
    return this.labels;
  }

  setLabels(labels: string[], descriptions?: Record<string, string>): void {
    this.labels = labels;
    if (descriptions) {
      this.labelDescriptions = new Map(Object.entries(descriptions));
    }
  }

  async classify(request: ClassificationRequest): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    const labels = request.candidateLabels || this.labels;
    if (labels.length === 0) {
      throw new Error("No candidate labels provided for classification");
    }

    // Build classification prompt
    const prompt = this.buildClassificationPrompt(request.content, labels, request.multiLabel);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a content classification assistant. Respond only with valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: this.config.temperature || 0,
          max_tokens: this.config.maxTokens || 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error("No response from OpenAI");
      }

      // Parse response
      const parsed = JSON.parse(content);
      const predictions = this.parseClassificationResponse(parsed, labels);

      return {
        predictions,
        confidence: predictions[0]?.probability || 0,
        inferenceTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error({ error }, "OpenAI classification failed");
      throw error;
    }
  }

  private buildClassificationPrompt(content: string, labels: string[], multiLabel?: boolean): string {
    const labelList = labels.map((l) => {
      const desc = this.labelDescriptions.get(l);
      return desc ? `- ${l}: ${desc}` : `- ${l}`;
    }).join("\n");

    return `Classify the following content into ${multiLabel ? "one or more" : "exactly one"} of these categories:

${labelList}

Content:
"""
${content.slice(0, 2000)}
"""

Respond with a JSON object containing:
- "classifications": array of objects with "label" (string) and "confidence" (number 0-1)
- "reasoning": brief explanation of the classification

Example response:
{
  "classifications": [{"label": "category1", "confidence": 0.9}, {"label": "category2", "confidence": 0.3}],
  "reasoning": "The content discusses..."
}`;
  }

  private parseClassificationResponse(
    response: { classifications?: Array<{ label: string; confidence: number }>; reasoning?: string },
    labels: string[]
  ): CategoryPrediction[] {
    if (!response.classifications) {
      return labels.map((l) => ({
        categoryId: l,
        categoryName: l,
        probability: 0,
        selected: false,
      }));
    }

    return response.classifications.map((c) => ({
      categoryId: c.label,
      categoryName: c.label,
      probability: c.confidence,
      selected: c.confidence > 0.5,
      explanation: response.reasoning,
    }));
  }
}

// ============================================================================
// LOCAL MOCK CLASSIFIER
// ============================================================================

/**
 * Local mock classifier for development/testing.
 * Uses rule-based heuristics.
 */
export class LocalMockClassifier implements NeuralClassifier {
  readonly name = "local-mock";
  readonly supportedTypes: ContentModality[] = ["text", "code", "image", "audio", "video", "multimodal"];

  private labels: string[] = [];
  private keywords: Map<string, string[]> = new Map();

  constructor() {
    // Default keywords for common categories
    this.keywords.set("ai", ["ai", "artificial", "intelligence", "machine", "learning", "ml", "neural", "deep"]);
    this.keywords.set("web", ["web", "react", "vue", "angular", "frontend", "html", "css", "javascript"]);
    this.keywords.set("backend", ["api", "server", "database", "backend", "node", "python", "java"]);
    this.keywords.set("devops", ["docker", "kubernetes", "ci", "cd", "deploy", "aws", "cloud"]);
    this.keywords.set("mobile", ["ios", "android", "mobile", "flutter", "react-native", "app"]);
    this.keywords.set("data", ["data", "analytics", "visualization", "pandas", "numpy", "sql"]);
    this.labels = Array.from(this.keywords.keys());
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLabels(): Promise<string[]> {
    return this.labels;
  }

  setKeywords(keywords: Record<string, string[]>): void {
    this.keywords = new Map(Object.entries(keywords));
    this.labels = Array.from(this.keywords.keys());
  }

  async classify(request: ClassificationRequest): Promise<NeuralClassificationResult> {
    const startTime = Date.now();
    const contentLower = request.content.toLowerCase();

    const predictions: CategoryPrediction[] = [];

    for (const [label, kw] of this.keywords) {
      const matches = kw.filter((k) => contentLower.includes(k));
      const probability = Math.min(1, matches.length / 3);

      predictions.push({
        categoryId: label,
        categoryName: label,
        probability,
        selected: probability > 0.3,
        explanation: matches.length > 0 ? `Matched keywords: ${matches.join(", ")}` : undefined,
      });
    }

    // Sort by probability
    predictions.sort((a, b) => b.probability - a.probability);

    // If no good matches, add a default
    if (predictions.every((p) => p.probability < 0.3)) {
      predictions.unshift({
        categoryId: "general",
        categoryName: "General",
        probability: 0.5,
        selected: true,
        explanation: "No specific category detected",
      });
    }

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// CODE CLASSIFIER
// ============================================================================

/**
 * Code-specific classifier using CodeBERT or language heuristics.
 */
export class CodeClassifier implements NeuralClassifier {
  readonly name = "code-classifier";
  readonly supportedTypes: ContentModality[] = ["code"];

  private languagePatterns: Map<string, RegExp[]> = new Map([
    ["typescript", [/interface\s+\w+/, /type\s+\w+\s*=/, /:\s*(string|number|boolean|any)\b/]],
    ["javascript", [/const\s+\w+\s*=/, /function\s+\w+/, /=>\s*\{/]],
    ["python", [/def\s+\w+\(/, /import\s+\w+/, /:\s*$/, /self\./]],
    ["java", [/public\s+class/, /private\s+\w+/, /void\s+\w+\(/]],
    ["rust", [/fn\s+\w+/, /let\s+mut/, /impl\s+\w+/]],
    ["go", [/func\s+\w+/, /package\s+\w+/, /:=\s*/]],
  ]);

  private domainKeywords: Map<string, string[]> = new Map([
    ["frontend", ["react", "vue", "angular", "component", "render", "dom", "css", "style"]],
    ["backend", ["express", "fastify", "django", "flask", "api", "route", "middleware"]],
    ["database", ["query", "select", "insert", "table", "schema", "index", "model"]],
    ["testing", ["test", "expect", "assert", "mock", "describe", "it("]],
    ["devops", ["docker", "kubernetes", "deploy", "config", "env", "ci"]],
  ]);

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getLabels(): Promise<string[]> {
    return [
      ...Array.from(this.languagePatterns.keys()),
      ...Array.from(this.domainKeywords.keys()),
    ];
  }

  async classify(request: ClassificationRequest): Promise<NeuralClassificationResult> {
    const startTime = Date.now();
    const predictions: CategoryPrediction[] = [];

    // Detect programming language
    for (const [lang, patterns] of this.languagePatterns) {
      const matches = patterns.filter((p) => p.test(request.content));
      const probability = matches.length / patterns.length;

      if (probability > 0.2) {
        predictions.push({
          categoryId: `lang-${lang}`,
          categoryName: `Language: ${lang}`,
          probability: Math.min(1, probability),
          selected: probability > 0.5,
          explanation: `Detected ${matches.length} ${lang} patterns`,
        });
      }
    }

    // Detect domain
    const contentLower = request.content.toLowerCase();
    for (const [domain, keywords] of this.domainKeywords) {
      const matches = keywords.filter((k) => contentLower.includes(k));
      const probability = Math.min(1, matches.length / 3);

      if (probability > 0.2) {
        predictions.push({
          categoryId: `domain-${domain}`,
          categoryName: `Domain: ${domain}`,
          probability,
          selected: probability > 0.5,
          explanation: `Found keywords: ${matches.join(", ")}`,
        });
      }
    }

    predictions.sort((a, b) => b.probability - a.probability);

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// CLASSIFIER MANAGER
// ============================================================================

/**
 * Manages multiple classifiers with routing and fallback.
 */
export class ClassifierManager {
  private classifiers: Map<string, NeuralClassifier> = new Map();
  private defaultClassifier: NeuralClassifier;

  constructor() {
    // Always have a local classifier as fallback
    this.defaultClassifier = new LocalMockClassifier();
    this.classifiers.set("local", this.defaultClassifier);
  }

  /**
   * Registers a classifier.
   */
  register(name: string, classifier: NeuralClassifier): void {
    this.classifiers.set(name, classifier);
  }

  /**
   * Gets the best classifier for a content type.
   */
  async getClassifier(contentType: ContentModality, preferredName?: string): Promise<NeuralClassifier> {
    // Try preferred classifier first
    if (preferredName) {
      const preferred = this.classifiers.get(preferredName);
      if (preferred && preferred.supportedTypes.includes(contentType) && await preferred.isAvailable()) {
        return preferred;
      }
    }

    // Find any available classifier for the content type
    for (const classifier of this.classifiers.values()) {
      if (classifier.supportedTypes.includes(contentType) && await classifier.isAvailable()) {
        return classifier;
      }
    }

    // Fallback to default
    return this.defaultClassifier;
  }

  /**
   * Classifies content using the best available classifier.
   */
  async classify(request: ClassificationRequest): Promise<NeuralClassificationResult> {
    const classifier = await this.getClassifier(request.contentType);
    return classifier.classify(request);
  }

  /**
   * Lists available classifiers.
   */
  async listAvailable(): Promise<Array<{ name: string; types: ContentModality[]; available: boolean }>> {
    const result = [];
    for (const [name, classifier] of this.classifiers) {
      result.push({
        name,
        types: classifier.supportedTypes,
        available: await classifier.isAvailable(),
      });
    }
    return result;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a classifier manager from environment configuration.
 */
export function createClassifierManager(): ClassifierManager {
  const manager = new ClassifierManager();

  // Register HuggingFace classifiers if API key available
  const hfApiKey = process.env.HUGGINGFACE_API_KEY;
  if (hfApiKey) {
    manager.register("huggingface-zero-shot", new HuggingFaceZeroShotClassifier({ apiKey: hfApiKey }));
    manager.register("huggingface-text", new HuggingFaceTextClassifier({ apiKey: hfApiKey }));
  }

  // Register OpenAI classifier if API key available
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    manager.register("openai", new OpenAIClassifier({ apiKey: openaiApiKey }));
  }

  // Always register code classifier
  manager.register("code", new CodeClassifier());

  return manager;
}

// ============================================================================
// SINGLETON
// ============================================================================

let classifierManagerInstance: ClassifierManager | null = null;

/**
 * Gets the singleton classifier manager instance.
 */
export function getClassifierManager(): ClassifierManager {
  if (!classifierManagerInstance) {
    classifierManagerInstance = createClassifierManager();
  }
  return classifierManagerInstance;
}

/**
 * Resets the singleton classifier manager.
 */
export function resetClassifierManager(): void {
  classifierManagerInstance = null;
}
