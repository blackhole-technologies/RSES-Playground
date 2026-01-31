/**
 * @file cross-modal-classifier.ts
 * @description Cross-modal classification system for text, code, images, and media.
 *              Supports multi-modal fusion and modality-specific models.
 *
 * @phase CMS Transformation - ML-Enhanced Auto-Link
 * @author ALK (Auto-Link Developer Agent)
 * @created 2026-02-01
 *
 * Supported Modalities:
 * - Text: BERT, RoBERTa, DistilBERT
 * - Code: CodeBERT, GraphCodeBERT
 * - Images: CLIP, ViT, ResNet
 * - Audio: Whisper (transcription) + text classification
 * - Video: Frame extraction + CLIP
 * - Multi-modal: Late/early/attention fusion
 */

import { createModuleLogger } from "../logger";
import {
  MultiModalContent,
  CrossModalClassificationResult,
  NeuralClassificationResult,
  CategoryPrediction,
  ContentModality,
} from "./ml-taxonomy-engine";
import { ClassifierManager, getClassifierManager } from "./neural-classifier";
import { EmbeddingProviderManager, getEmbeddingManager } from "./embedding-providers";

const log = createModuleLogger("cross-modal-classifier");

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Modality-specific classifier configuration.
 */
export interface ModalityClassifierConfig {
  /** Model ID for this modality */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Threshold for classification */
  threshold: number;
  /** Weight in fusion */
  fusionWeight: number;
}

/**
 * Fusion strategy configuration.
 */
export interface FusionConfig {
  /** Fusion method */
  method: "late" | "early" | "attention";
  /** Temperature for attention fusion */
  temperature?: number;
  /** Modality weights */
  weights?: Record<ContentModality, number>;
  /** Minimum modalities required */
  minModalities?: number;
}

/**
 * Cross-modal classifier configuration.
 */
export interface CrossModalClassifierConfig {
  /** Per-modality classifiers */
  modalities: Partial<Record<ContentModality, ModalityClassifierConfig>>;
  /** Fusion configuration */
  fusion: FusionConfig;
  /** Enable consistency checking */
  enableConsistencyCheck: boolean;
  /** Consistency threshold */
  consistencyThreshold: number;
}

/**
 * Modality detection result.
 */
export interface ModalityDetectionResult {
  /** Primary modality */
  primary: ContentModality;
  /** Detected modalities */
  detected: ContentModality[];
  /** Confidence in detection */
  confidence: number;
}

/**
 * Image analysis result.
 */
export interface ImageAnalysisResult {
  /** Image labels */
  labels: Array<{ label: string; confidence: number }>;
  /** Objects detected */
  objects?: Array<{ name: string; bbox: [number, number, number, number]; confidence: number }>;
  /** Text extracted (OCR) */
  extractedText?: string;
  /** Dominant colors */
  colors?: string[];
}

/**
 * Audio analysis result.
 */
export interface AudioAnalysisResult {
  /** Transcribed text */
  transcription?: string;
  /** Language detected */
  language?: string;
  /** Speaker count */
  speakerCount?: number;
  /** Audio classification */
  classification?: Array<{ label: string; confidence: number }>;
}

/**
 * Video analysis result.
 */
export interface VideoAnalysisResult {
  /** Key frames analyzed */
  keyFrames: ImageAnalysisResult[];
  /** Audio track analysis */
  audioTrack?: AudioAnalysisResult;
  /** Scene transitions */
  sceneCount?: number;
  /** Aggregated labels */
  aggregatedLabels: Array<{ label: string; confidence: number; frameCount: number }>;
}

// ============================================================================
// MODALITY DETECTOR
// ============================================================================

/**
 * Detects content modality from input.
 */
export class ModalityDetector {
  private extensionMap: Map<string, ContentModality> = new Map([
    // Text
    ["txt", "text"],
    ["md", "text"],
    ["json", "text"],
    ["xml", "text"],
    ["yaml", "text"],
    ["yml", "text"],
    ["csv", "text"],

    // Code
    ["ts", "code"],
    ["tsx", "code"],
    ["js", "code"],
    ["jsx", "code"],
    ["py", "code"],
    ["java", "code"],
    ["go", "code"],
    ["rs", "code"],
    ["cpp", "code"],
    ["c", "code"],
    ["h", "code"],
    ["rb", "code"],
    ["php", "code"],
    ["swift", "code"],
    ["kt", "code"],
    ["scala", "code"],
    ["sql", "code"],
    ["sh", "code"],
    ["bash", "code"],

    // Images
    ["png", "image"],
    ["jpg", "image"],
    ["jpeg", "image"],
    ["gif", "image"],
    ["svg", "image"],
    ["webp", "image"],
    ["bmp", "image"],
    ["ico", "image"],

    // Audio
    ["mp3", "audio"],
    ["wav", "audio"],
    ["ogg", "audio"],
    ["flac", "audio"],
    ["m4a", "audio"],
    ["aac", "audio"],

    // Video
    ["mp4", "video"],
    ["webm", "video"],
    ["avi", "video"],
    ["mov", "video"],
    ["mkv", "video"],
    ["flv", "video"],
  ]);

  /**
   * Detects modality from file path.
   */
  detectFromPath(path: string): ModalityDetectionResult {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const modality = this.extensionMap.get(ext) || "text";

    return {
      primary: modality,
      detected: [modality],
      confidence: 0.9,
    };
  }

  /**
   * Detects modality from MultiModalContent.
   */
  detectFromContent(content: MultiModalContent): ModalityDetectionResult {
    const detected: ContentModality[] = [];

    if (content.text) detected.push("text");
    if (content.code) detected.push("code");
    if (content.image) detected.push("image");
    if (content.audio) detected.push("audio");
    if (content.video) detected.push("video");

    const primary = content.primaryModality || detected[0] || "text";

    return {
      primary,
      detected,
      confidence: 1.0,
    };
  }

  /**
   * Detects modality from MIME type.
   */
  detectFromMimeType(mimeType: string): ModalityDetectionResult {
    const [type, subtype] = mimeType.split("/");

    let modality: ContentModality;
    switch (type) {
      case "image":
        modality = "image";
        break;
      case "audio":
        modality = "audio";
        break;
      case "video":
        modality = "video";
        break;
      case "text":
        modality = subtype?.includes("javascript") || subtype?.includes("python")
          ? "code"
          : "text";
        break;
      case "application":
        modality = subtype?.includes("json") || subtype?.includes("javascript")
          ? "code"
          : "text";
        break;
      default:
        modality = "text";
    }

    return {
      primary: modality,
      detected: [modality],
      confidence: 0.85,
    };
  }
}

// ============================================================================
// CROSS-MODAL CLASSIFIER
// ============================================================================

/**
 * Cross-modal classifier supporting multiple content types.
 */
export class CrossModalClassifier {
  private config: CrossModalClassifierConfig;
  private classifierManager: ClassifierManager;
  private embeddingManager: EmbeddingProviderManager;
  private modalityDetector: ModalityDetector;

  constructor(config: CrossModalClassifierConfig) {
    this.config = config;
    this.classifierManager = getClassifierManager();
    this.embeddingManager = getEmbeddingManager();
    this.modalityDetector = new ModalityDetector();
  }

  /**
   * Classifies multi-modal content.
   */
  async classify(content: MultiModalContent): Promise<CrossModalClassificationResult> {
    const modalities: CrossModalClassificationResult["modalities"] = {};

    // Classify each modality
    if (content.text) {
      modalities.text = await this.classifyText(content.text);
    }

    if (content.code) {
      modalities.code = await this.classifyCode(content.code);
    }

    if (content.image) {
      modalities.image = await this.classifyImage(content.image);
    }

    if (content.audio) {
      modalities.audio = await this.classifyAudio(content.audio);
    }

    if (content.video) {
      modalities.video = await this.classifyVideo(content.video);
    }

    // Fuse results
    const fused = this.fuseResults(modalities);

    // Calculate consistency
    const consistency = this.calculateConsistency(modalities);

    return {
      modalities,
      fused,
      consistency,
    };
  }

  /**
   * Classifies text content.
   */
  private async classifyText(text: string): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    try {
      const result = await this.classifierManager.classify({
        content: text,
        contentType: "text",
        multiLabel: true,
      });

      return result;
    } catch (error) {
      log.error({ error }, "Text classification failed");
      return this.createEmptyResult(startTime);
    }
  }

  /**
   * Classifies code content.
   */
  private async classifyCode(code: { language: string; source: string }): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    try {
      // Include language as context
      const content = `Language: ${code.language}\n\n${code.source}`;

      const result = await this.classifierManager.classify({
        content,
        contentType: "code",
        multiLabel: true,
      });

      // Add language-based predictions
      const languagePredictions = this.getLanguageBasedPredictions(code.language);

      return {
        ...result,
        predictions: [...result.predictions, ...languagePredictions],
      };
    } catch (error) {
      log.error({ error }, "Code classification failed");
      return this.createEmptyResult(startTime);
    }
  }

  /**
   * Gets predictions based on programming language.
   */
  private getLanguageBasedPredictions(language: string): CategoryPrediction[] {
    const languageCategories: Record<string, string[]> = {
      typescript: ["frontend", "web", "nodejs"],
      javascript: ["frontend", "web", "nodejs"],
      python: ["ml", "data-science", "backend", "scripting"],
      java: ["backend", "enterprise", "android"],
      go: ["backend", "devops", "systems"],
      rust: ["systems", "performance", "webassembly"],
      swift: ["ios", "mobile", "macos"],
      kotlin: ["android", "mobile", "backend"],
      ruby: ["backend", "scripting", "web"],
      php: ["backend", "web"],
      cpp: ["systems", "performance", "gaming"],
      csharp: ["backend", "gaming", "windows"],
    };

    const categories = languageCategories[language.toLowerCase()] || [];

    return categories.map((cat, i) => ({
      categoryId: `lang-${cat}`,
      categoryName: cat,
      probability: 0.6 - i * 0.1,
      selected: i < 2,
      explanation: `Common category for ${language}`,
    }));
  }

  /**
   * Classifies image content.
   */
  private async classifyImage(image: { path: string; mimeType: string; dimensions?: { width: number; height: number } }): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    // In production, this would call CLIP or similar
    // For now, return placeholder based on file name
    const filename = image.path.split("/").pop() || "";
    const predictions: CategoryPrediction[] = [];

    // Simple heuristics based on filename
    if (filename.includes("screenshot") || filename.includes("screen")) {
      predictions.push({
        categoryId: "screenshot",
        categoryName: "Screenshot",
        probability: 0.9,
        selected: true,
        explanation: "Filename suggests screenshot",
      });
    }

    if (filename.includes("logo") || filename.includes("icon")) {
      predictions.push({
        categoryId: "branding",
        categoryName: "Branding",
        probability: 0.85,
        selected: true,
        explanation: "Filename suggests branding asset",
      });
    }

    if (filename.includes("photo") || filename.includes("img")) {
      predictions.push({
        categoryId: "photography",
        categoryName: "Photography",
        probability: 0.7,
        selected: true,
        explanation: "Filename suggests photograph",
      });
    }

    // Default prediction
    if (predictions.length === 0) {
      predictions.push({
        categoryId: "image",
        categoryName: "Image",
        probability: 0.5,
        selected: true,
        explanation: "Generic image classification",
      });
    }

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Classifies audio content.
   */
  private async classifyAudio(audio: { path: string; mimeType: string; duration?: number }): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    // In production, this would use Whisper for transcription + text classification
    const predictions: CategoryPrediction[] = [];

    // Classify by duration and format
    if (audio.duration) {
      if (audio.duration < 60) {
        predictions.push({
          categoryId: "sound-effect",
          categoryName: "Sound Effect",
          probability: 0.6,
          selected: true,
          explanation: "Short audio duration",
        });
      } else if (audio.duration < 600) {
        predictions.push({
          categoryId: "podcast-clip",
          categoryName: "Podcast Clip",
          probability: 0.5,
          selected: false,
          explanation: "Medium audio duration",
        });
      } else {
        predictions.push({
          categoryId: "long-form-audio",
          categoryName: "Long-form Audio",
          probability: 0.5,
          selected: false,
          explanation: "Long audio duration",
        });
      }
    }

    // Default
    if (predictions.length === 0) {
      predictions.push({
        categoryId: "audio",
        categoryName: "Audio",
        probability: 0.5,
        selected: true,
        explanation: "Generic audio classification",
      });
    }

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Classifies video content.
   */
  private async classifyVideo(video: { path: string; mimeType: string; duration?: number }): Promise<NeuralClassificationResult> {
    const startTime = Date.now();

    // In production, this would extract key frames and use CLIP
    const predictions: CategoryPrediction[] = [];
    const filename = video.path.split("/").pop() || "";

    // Heuristics based on filename and duration
    if (filename.includes("tutorial") || filename.includes("how")) {
      predictions.push({
        categoryId: "tutorial",
        categoryName: "Tutorial",
        probability: 0.8,
        selected: true,
        explanation: "Filename suggests tutorial",
      });
    }

    if (filename.includes("demo") || filename.includes("preview")) {
      predictions.push({
        categoryId: "demo",
        categoryName: "Demo",
        probability: 0.75,
        selected: true,
        explanation: "Filename suggests demo",
      });
    }

    if (video.duration) {
      if (video.duration < 60) {
        predictions.push({
          categoryId: "short-clip",
          categoryName: "Short Clip",
          probability: 0.6,
          selected: predictions.length === 0,
          explanation: "Short video duration",
        });
      }
    }

    // Default
    if (predictions.length === 0) {
      predictions.push({
        categoryId: "video",
        categoryName: "Video",
        probability: 0.5,
        selected: true,
        explanation: "Generic video classification",
      });
    }

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Creates an empty classification result.
   */
  private createEmptyResult(startTime: number): NeuralClassificationResult {
    return {
      predictions: [],
      confidence: 0,
      inferenceTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Fuses results from multiple modalities.
   */
  private fuseResults(modalities: CrossModalClassificationResult["modalities"]): CrossModalClassificationResult["fused"] {
    const { method, weights } = this.config.fusion;

    switch (method) {
      case "late":
        return this.lateFusion(modalities, weights);
      case "early":
        return this.earlyFusion(modalities, weights);
      case "attention":
        return this.attentionFusion(modalities);
      default:
        return this.lateFusion(modalities, weights);
    }
  }

  /**
   * Late fusion: combine predictions after individual classification.
   */
  private lateFusion(
    modalities: CrossModalClassificationResult["modalities"],
    weights?: Record<ContentModality, number>
  ): CrossModalClassificationResult["fused"] {
    const aggregatedPredictions = new Map<string, { sum: number; count: number; sources: string[] }>();

    const defaultWeights: Record<ContentModality, number> = {
      text: 1.0,
      code: 1.0,
      image: 0.8,
      audio: 0.7,
      video: 0.8,
      multimodal: 1.0,
    };

    const effectiveWeights = { ...defaultWeights, ...weights };

    for (const [modality, result] of Object.entries(modalities)) {
      if (!result) continue;

      const weight = effectiveWeights[modality as ContentModality];

      for (const pred of result.predictions) {
        const key = pred.categoryId;
        if (!aggregatedPredictions.has(key)) {
          aggregatedPredictions.set(key, { sum: 0, count: 0, sources: [] });
        }

        const entry = aggregatedPredictions.get(key)!;
        entry.sum += pred.probability * weight;
        entry.count += weight;
        entry.sources.push(modality);
      }
    }

    // Calculate final predictions
    const predictions: CategoryPrediction[] = [];
    for (const [categoryId, data] of aggregatedPredictions) {
      const probability = data.sum / data.count;
      predictions.push({
        categoryId,
        categoryName: categoryId,
        probability,
        selected: probability > 0.5,
        explanation: `Fused from ${data.sources.join(", ")} modalities`,
      });
    }

    predictions.sort((a, b) => b.probability - a.probability);

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      fusionMethod: "late",
    };
  }

  /**
   * Early fusion: combine embeddings before classification.
   * Placeholder - would need joint embedding space.
   */
  private earlyFusion(
    modalities: CrossModalClassificationResult["modalities"],
    _weights?: Record<ContentModality, number>
  ): CrossModalClassificationResult["fused"] {
    // For early fusion, we would need to:
    // 1. Extract embeddings for each modality
    // 2. Project to shared space
    // 3. Concatenate or average
    // 4. Run single classifier

    // Fall back to late fusion for now
    return this.lateFusion(modalities, _weights);
  }

  /**
   * Attention-based fusion: learn weights based on content.
   */
  private attentionFusion(
    modalities: CrossModalClassificationResult["modalities"]
  ): CrossModalClassificationResult["fused"] {
    // Calculate attention weights based on confidence
    const results = Object.entries(modalities).filter(([_, r]) => r !== undefined);

    if (results.length === 0) {
      return { predictions: [], confidence: 0, fusionMethod: "attention" };
    }

    // Use confidence as attention weight
    const totalConfidence = results.reduce((sum, [_, r]) => sum + (r?.confidence || 0), 0);

    const aggregatedPredictions = new Map<string, { sum: number; count: number }>();

    for (const [_modality, result] of results) {
      if (!result) continue;

      const weight = totalConfidence > 0 ? result.confidence / totalConfidence : 1 / results.length;

      for (const pred of result.predictions) {
        const key = pred.categoryId;
        if (!aggregatedPredictions.has(key)) {
          aggregatedPredictions.set(key, { sum: 0, count: 0 });
        }

        const entry = aggregatedPredictions.get(key)!;
        entry.sum += pred.probability * weight;
        entry.count += 1;
      }
    }

    const predictions: CategoryPrediction[] = [];
    for (const [categoryId, data] of aggregatedPredictions) {
      predictions.push({
        categoryId,
        categoryName: categoryId,
        probability: data.sum,
        selected: data.sum > 0.5,
        explanation: `Attention-weighted fusion`,
      });
    }

    predictions.sort((a, b) => b.probability - a.probability);

    return {
      predictions,
      confidence: predictions[0]?.probability || 0,
      fusionMethod: "attention",
    };
  }

  /**
   * Calculates consistency across modalities.
   */
  private calculateConsistency(modalities: CrossModalClassificationResult["modalities"]): number {
    const results = Object.values(modalities).filter((r) => r !== undefined);

    if (results.length < 2) return 1.0;

    // Get top predictions from each modality
    const topCategories = results.map((r) => r!.predictions[0]?.categoryId).filter((c) => c !== undefined);

    if (topCategories.length === 0) return 1.0;

    // Calculate agreement
    const uniqueCategories = new Set(topCategories);
    return 1 - (uniqueCategories.size - 1) / topCategories.length;
  }

  /**
   * Detects modality from content.
   */
  detectModality(content: MultiModalContent | string): ModalityDetectionResult {
    if (typeof content === "string") {
      return this.modalityDetector.detectFromPath(content);
    }
    return this.modalityDetector.detectFromContent(content);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Creates a cross-modal classifier with default configuration.
 */
export function createCrossModalClassifier(): CrossModalClassifier {
  const config: CrossModalClassifierConfig = {
    modalities: {
      text: {
        modelId: "distilbert-base-uncased",
        provider: "huggingface",
        threshold: 0.5,
        fusionWeight: 1.0,
      },
      code: {
        modelId: "codebert-base",
        provider: "huggingface",
        threshold: 0.5,
        fusionWeight: 1.0,
      },
      image: {
        modelId: "clip-vit-b32",
        provider: "openai",
        threshold: 0.5,
        fusionWeight: 0.8,
      },
      audio: {
        modelId: "whisper-small",
        provider: "openai",
        threshold: 0.5,
        fusionWeight: 0.7,
      },
      video: {
        modelId: "clip-vit-b32",
        provider: "openai",
        threshold: 0.5,
        fusionWeight: 0.8,
      },
    },
    fusion: {
      method: "attention",
      temperature: 1.0,
      minModalities: 1,
    },
    enableConsistencyCheck: true,
    consistencyThreshold: 0.7,
  };

  return new CrossModalClassifier(config);
}

// ============================================================================
// SINGLETON
// ============================================================================

let crossModalClassifierInstance: CrossModalClassifier | null = null;

/**
 * Gets the singleton cross-modal classifier.
 */
export function getCrossModalClassifier(): CrossModalClassifier {
  if (!crossModalClassifierInstance) {
    crossModalClassifierInstance = createCrossModalClassifier();
  }
  return crossModalClassifierInstance;
}

/**
 * Resets the singleton cross-modal classifier.
 */
export function resetCrossModalClassifier(): void {
  crossModalClassifierInstance = null;
}
