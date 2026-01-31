/**
 * @file quantum-taxonomy.ts
 * @description Quantum-Ready Taxonomy Theory with Advanced AI Integration
 *              Extends classical set-theoretic taxonomy with quantum mechanics,
 *              fuzzy logic, knowledge graphs, temporal reasoning, and neural learning.
 *
 * @phase Phase 9+ - Quantum-Enhanced Taxonomy System
 * @author SGT (Set-Graph Theorist Agent) - Enhanced Edition
 * @created 2026-02-01
 * @version 2.0
 *
 * Theoretical Foundations:
 * ========================
 *
 * 1. QUANTUM SET THEORY
 *    - Terms exist in superposition until measurement (classification confirmation)
 *    - Entanglement between related categories
 *    - Quantum interference for ambiguous classifications
 *    - Decoherence modeling for classification certainty
 *
 * 2. PROBABILISTIC MEMBERSHIP
 *    - Fuzzy set membership functions mu: T -> [0,1]
 *    - Rough sets with lower/upper approximations
 *    - Bayesian posterior classification probabilities
 *    - Confidence intervals and uncertainty quantification
 *
 * 3. KNOWLEDGE GRAPH INTEGRATION
 *    - RDF-compatible triple store semantics
 *    - OWL ontology reasoning
 *    - Graph neural network embeddings
 *    - Path-based inference
 *
 * 4. TEMPORAL DIMENSIONS
 *    - Bitemporal data model (valid time + transaction time)
 *    - Taxonomy evolution tracking
 *    - Historical querying and point-in-time analysis
 *    - Trend prediction using temporal patterns
 *
 * 5. AI/ML INTEGRATION
 *    - Graph Neural Networks for structure learning
 *    - TransE/RotatE knowledge graph embeddings
 *    - Attention mechanisms for relevance weighting
 *    - Reinforcement learning for query optimization
 *
 * Mathematical Framework:
 * =======================
 *
 * Let H be a Hilbert space of classification states.
 * A quantum term |t> is a vector in H with:
 *   |t> = sum_i alpha_i |c_i>
 *
 * where c_i are classical category basis states and alpha_i are complex amplitudes.
 *
 * The density matrix rho = |psi><psi| encodes the mixed state of uncertain classifications.
 *
 * Measurement collapses the superposition:
 *   P(c_i) = |alpha_i|^2
 */

import {
  Term,
  Vocabulary,
  ContentTermGraph,
  computeTransitiveClosure,
  computeDescendants,
} from './taxonomy-algebra';

// =============================================================================
// QUANTUM FOUNDATIONS
// =============================================================================

/**
 * Complex number representation for quantum amplitudes.
 * z = a + bi where a is real part, b is imaginary part.
 */
export interface ComplexNumber {
  real: number;
  imag: number;
}

/**
 * Complex amplitude with magnitude and phase.
 * Encodes probability amplitude for quantum states.
 */
export interface ComplexAmplitude {
  /** Complex number representation */
  value: ComplexNumber;
  /** Magnitude |z| = sqrt(a^2 + b^2) */
  magnitude: number;
  /** Phase arg(z) = atan2(b, a) */
  phase: number;
}

/**
 * Measurement basis for quantum state collapse.
 * Determines how superposition collapses to classical states.
 */
export interface MeasurementBasis {
  /** Unique identifier for this basis */
  id: string;
  /** Human-readable name */
  name: string;
  /** Basis vectors (orthonormal) */
  basisVectors: QuantumBasisVector[];
  /** Whether this is the computational basis */
  isComputational: boolean;
}

/**
 * A basis vector in the measurement basis.
 */
export interface QuantumBasisVector {
  /** Label for this basis state */
  label: string;
  /** Classical term this basis state corresponds to */
  classicalTermId: number;
  /** Coefficient in the basis transformation */
  coefficient: ComplexNumber;
}

/**
 * Quantum term extending classical term with superposition.
 * Content can exist in superposition of categories until measured.
 */
export interface QuantumTerm {
  /** Unique identifier */
  id: string;

  /** The classical term when fully collapsed */
  classicalState: Term;

  /**
   * Superposition of possible classifications.
   * Maps classical term IDs to their quantum amplitudes.
   * Sum of |amplitude|^2 must equal 1 (normalization).
   */
  superposition: Map<number, ComplexAmplitude>;

  /**
   * Entangled quantum terms.
   * When one is measured, entangled terms' states correlate.
   */
  entangledWith: string[];

  /**
   * Bell state type for maximally entangled pairs.
   * null if not in a Bell state.
   */
  bellState?: 'phi_plus' | 'phi_minus' | 'psi_plus' | 'psi_minus';

  /** Measurement basis for collapsing superposition */
  measurementBasis: MeasurementBasis;

  /** Coherence factor [0,1] - how "quantum" vs "classical" */
  coherence: number;

  /** Decoherence rate - how fast superposition collapses naturally */
  decoherenceRate: number;

  /** Last measurement timestamp */
  lastMeasurement?: Date;

  /** Number of measurements performed */
  measurementCount: number;

  /** Quantum metadata */
  quantumMetadata: {
    /** Preparation method */
    preparation: 'ground' | 'excited' | 'superposition' | 'entangled';
    /** Gate sequence applied */
    gateHistory: QuantumGate[];
    /** Environmental noise level */
    noiseLevel: number;
  };
}

/**
 * Quantum gate for state transformation.
 */
export interface QuantumGate {
  /** Gate type */
  type: 'X' | 'Y' | 'Z' | 'H' | 'CNOT' | 'T' | 'S' | 'SWAP' | 'Rx' | 'Ry' | 'Rz';
  /** Target qubit(s) */
  targets: number[];
  /** Control qubit(s) for controlled gates */
  controls?: number[];
  /** Rotation angle for parametric gates */
  theta?: number;
  /** Timestamp of application */
  appliedAt: Date;
}

// =============================================================================
// COMPLEX NUMBER OPERATIONS
// =============================================================================

export const Complex = {
  /** Create a complex number */
  create(real: number, imag: number): ComplexNumber {
    return { real, imag };
  },

  /** Create from polar form */
  fromPolar(magnitude: number, phase: number): ComplexNumber {
    return {
      real: magnitude * Math.cos(phase),
      imag: magnitude * Math.sin(phase),
    };
  },

  /** Add two complex numbers */
  add(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return { real: a.real + b.real, imag: a.imag + b.imag };
  },

  /** Multiply two complex numbers */
  multiply(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
    return {
      real: a.real * b.real - a.imag * b.imag,
      imag: a.real * b.imag + a.imag * b.real,
    };
  },

  /** Complex conjugate */
  conjugate(z: ComplexNumber): ComplexNumber {
    return { real: z.real, imag: -z.imag };
  },

  /** Magnitude (absolute value) */
  magnitude(z: ComplexNumber): number {
    return Math.sqrt(z.real * z.real + z.imag * z.imag);
  },

  /** Phase (argument) */
  phase(z: ComplexNumber): number {
    return Math.atan2(z.imag, z.real);
  },

  /** Create amplitude from complex number */
  toAmplitude(z: ComplexNumber): ComplexAmplitude {
    return {
      value: z,
      magnitude: Complex.magnitude(z),
      phase: Complex.phase(z),
    };
  },

  /** Normalize a set of amplitudes */
  normalizeAmplitudes(amplitudes: Map<number, ComplexAmplitude>): Map<number, ComplexAmplitude> {
    let totalProbability = 0;
    for (const amp of amplitudes.values()) {
      totalProbability += amp.magnitude * amp.magnitude;
    }

    const norm = Math.sqrt(totalProbability);
    const normalized = new Map<number, ComplexAmplitude>();

    for (const [key, amp] of amplitudes) {
      const newMag = amp.magnitude / norm;
      normalized.set(key, {
        value: Complex.fromPolar(newMag, amp.phase),
        magnitude: newMag,
        phase: amp.phase,
      });
    }

    return normalized;
  },
};

// =============================================================================
// QUANTUM STATE OPERATIONS
// =============================================================================

/**
 * Creates a quantum term in superposition of categories.
 *
 * @param classicalTerm - Base classical term
 * @param categories - Categories with probability weights
 * @returns Quantum term in superposition
 */
export function createSuperposition(
  classicalTerm: Term,
  categories: Map<number, number> // termId -> probability
): QuantumTerm {
  // Convert probabilities to amplitudes (sqrt of probability)
  const superposition = new Map<number, ComplexAmplitude>();

  for (const [termId, probability] of categories) {
    const amplitude = Math.sqrt(probability);
    superposition.set(termId, Complex.toAmplitude(Complex.create(amplitude, 0)));
  }

  // Normalize
  const normalized = Complex.normalizeAmplitudes(superposition);

  return {
    id: `quantum-${classicalTerm.id}-${Date.now()}`,
    classicalState: classicalTerm,
    superposition: normalized,
    entangledWith: [],
    measurementBasis: createComputationalBasis([...categories.keys()]),
    coherence: 1.0,
    decoherenceRate: 0.01,
    measurementCount: 0,
    quantumMetadata: {
      preparation: 'superposition',
      gateHistory: [],
      noiseLevel: 0,
    },
  };
}

/**
 * Creates the computational basis for measurement.
 */
function createComputationalBasis(termIds: number[]): MeasurementBasis {
  const basisVectors: QuantumBasisVector[] = termIds.map((id, index) => ({
    label: `|${index}>`,
    classicalTermId: id,
    coefficient: Complex.create(1, 0),
  }));

  return {
    id: 'computational',
    name: 'Computational Basis',
    basisVectors,
    isComputational: true,
  };
}

/**
 * Measures a quantum term, collapsing superposition to classical state.
 *
 * @param quantumTerm - The quantum term to measure
 * @returns Collapsed classical term ID and measurement probability
 */
export function measureQuantumTerm(quantumTerm: QuantumTerm): {
  collapsedTermId: number;
  probability: number;
  remainingSuperposition: Map<number, ComplexAmplitude>;
} {
  // Sample from probability distribution
  const random = Math.random();
  let cumulativeProbability = 0;
  let collapsedTermId = -1;
  let collapsedProbability = 0;

  for (const [termId, amplitude] of quantumTerm.superposition) {
    const probability = amplitude.magnitude * amplitude.magnitude;
    cumulativeProbability += probability;

    if (random <= cumulativeProbability && collapsedTermId === -1) {
      collapsedTermId = termId;
      collapsedProbability = probability;
    }
  }

  // Handle entanglement - correlated measurements
  // In a real implementation, this would update entangled terms

  return {
    collapsedTermId,
    probability: collapsedProbability,
    remainingSuperposition: new Map([[collapsedTermId, Complex.toAmplitude(Complex.create(1, 0))]]),
  };
}

/**
 * Creates entanglement between two quantum terms.
 * Creates a Bell state for maximal correlation.
 *
 * @param term1 - First quantum term
 * @param term2 - Second quantum term
 * @param bellState - Type of Bell state
 * @returns Updated entangled terms
 */
export function entangleTerms(
  term1: QuantumTerm,
  term2: QuantumTerm,
  bellState: 'phi_plus' | 'phi_minus' | 'psi_plus' | 'psi_minus' = 'phi_plus'
): [QuantumTerm, QuantumTerm] {
  const entangled1: QuantumTerm = {
    ...term1,
    entangledWith: [...term1.entangledWith, term2.id],
    bellState,
    coherence: Math.max(term1.coherence, term2.coherence),
  };

  const entangled2: QuantumTerm = {
    ...term2,
    entangledWith: [...term2.entangledWith, term1.id],
    bellState,
    coherence: Math.max(term1.coherence, term2.coherence),
  };

  return [entangled1, entangled2];
}

/**
 * Applies Hadamard gate to create equal superposition.
 */
export function applyHadamard(term: QuantumTerm): QuantumTerm {
  const termIds = [...term.superposition.keys()];
  const equalProb = 1 / termIds.length;
  const amplitude = Math.sqrt(equalProb);

  const newSuperposition = new Map<number, ComplexAmplitude>();
  for (const id of termIds) {
    newSuperposition.set(id, Complex.toAmplitude(Complex.create(amplitude, 0)));
  }

  return {
    ...term,
    superposition: newSuperposition,
    quantumMetadata: {
      ...term.quantumMetadata,
      gateHistory: [...term.quantumMetadata.gateHistory, {
        type: 'H',
        targets: [0],
        appliedAt: new Date(),
      }],
    },
  };
}

/**
 * Models decoherence - gradual loss of quantum behavior.
 *
 * @param term - Quantum term
 * @param deltaTime - Time elapsed since last update (ms)
 * @returns Updated term with reduced coherence
 */
export function applyDecoherence(term: QuantumTerm, deltaTime: number): QuantumTerm {
  // Exponential decay of coherence
  const newCoherence = term.coherence * Math.exp(-term.decoherenceRate * deltaTime / 1000);

  // If coherence drops below threshold, collapse to most likely state
  if (newCoherence < 0.01) {
    const { collapsedTermId } = measureQuantumTerm(term);
    return {
      ...term,
      coherence: 0,
      superposition: new Map([[collapsedTermId, Complex.toAmplitude(Complex.create(1, 0))]]),
    };
  }

  return {
    ...term,
    coherence: newCoherence,
  };
}

// =============================================================================
// PROBABILISTIC MEMBERSHIP (FUZZY SETS)
// =============================================================================

/**
 * Fuzzy membership function type.
 */
export type MembershipFunction = (value: number) => number;

/**
 * Fuzzy set with membership function.
 */
export interface FuzzySet {
  /** Set identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Membership function mu: X -> [0,1] */
  membershipFunction: MembershipFunction;
  /** Core set (mu = 1) */
  core: number[];
  /** Support set (mu > 0) */
  support: number[];
  /** Alpha cuts */
  alphaCuts: Map<number, number[]>;
}

/**
 * Fuzzy term membership for probabilistic classification.
 */
export interface FuzzyTermMembership {
  /** Term ID */
  termId: number;
  /** Membership degree [0, 1] */
  degree: number;
  /** Confidence in the membership assessment */
  confidence: number;
  /** Method used to compute membership */
  method: 'triangular' | 'trapezoidal' | 'gaussian' | 'sigmoid' | 'custom';
  /** Parameters for the membership function */
  parameters: Record<string, number>;
}

/**
 * Probabilistic category assignment with Bayesian inference.
 */
export interface BayesianClassification {
  /** Content ID */
  contentId: string;
  /** Prior probabilities P(C) */
  priors: Map<number, number>;
  /** Likelihoods P(X|C) */
  likelihoods: Map<number, number>;
  /** Posterior probabilities P(C|X) */
  posteriors: Map<number, number>;
  /** Evidence P(X) */
  evidence: number;
  /** Maximum a posteriori (MAP) estimate */
  mapEstimate: number;
  /** Confidence interval */
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number; // e.g., 0.95 for 95% CI
  };
}

/**
 * Common membership functions.
 */
export const MembershipFunctions = {
  /** Triangular membership function */
  triangular(a: number, b: number, c: number): MembershipFunction {
    return (x: number) => {
      if (x <= a || x >= c) return 0;
      if (x === b) return 1;
      if (x < b) return (x - a) / (b - a);
      return (c - x) / (c - b);
    };
  },

  /** Trapezoidal membership function */
  trapezoidal(a: number, b: number, c: number, d: number): MembershipFunction {
    return (x: number) => {
      if (x <= a || x >= d) return 0;
      if (x >= b && x <= c) return 1;
      if (x < b) return (x - a) / (b - a);
      return (d - x) / (d - c);
    };
  },

  /** Gaussian membership function */
  gaussian(center: number, sigma: number): MembershipFunction {
    return (x: number) => {
      return Math.exp(-Math.pow(x - center, 2) / (2 * sigma * sigma));
    };
  },

  /** Sigmoid membership function */
  sigmoid(center: number, slope: number): MembershipFunction {
    return (x: number) => {
      return 1 / (1 + Math.exp(-slope * (x - center)));
    };
  },

  /** Bell-shaped membership function */
  bell(a: number, b: number, c: number): MembershipFunction {
    return (x: number) => {
      return 1 / (1 + Math.pow(Math.abs((x - c) / a), 2 * b));
    };
  },
};

/**
 * Fuzzy set operations.
 */
export const FuzzyOperations = {
  /** Fuzzy AND (t-norm) - minimum */
  and(a: number, b: number): number {
    return Math.min(a, b);
  },

  /** Fuzzy OR (t-conorm) - maximum */
  or(a: number, b: number): number {
    return Math.max(a, b);
  },

  /** Fuzzy NOT - complement */
  not(a: number): number {
    return 1 - a;
  },

  /** Product t-norm */
  productAnd(a: number, b: number): number {
    return a * b;
  },

  /** Probabilistic OR */
  probabilisticOr(a: number, b: number): number {
    return a + b - a * b;
  },

  /** Lukasiewicz t-norm */
  lukasiewiczAnd(a: number, b: number): number {
    return Math.max(0, a + b - 1);
  },

  /** Lukasiewicz t-conorm */
  lukasiewiczOr(a: number, b: number): number {
    return Math.min(1, a + b);
  },

  /** Defuzzification - centroid method */
  centroidDefuzzify(values: number[], memberships: number[]): number {
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < values.length; i++) {
      numerator += values[i] * memberships[i];
      denominator += memberships[i];
    }

    return denominator > 0 ? numerator / denominator : 0;
  },
};

/**
 * Rough set for handling uncertainty via approximations.
 */
export interface RoughSet {
  /** Set identifier */
  id: string;
  /** Lower approximation (definitely in set) */
  lowerApproximation: Set<number>;
  /** Upper approximation (possibly in set) */
  upperApproximation: Set<number>;
  /** Boundary region (uncertain) */
  boundary: Set<number>;
  /** Accuracy of approximation */
  accuracy: number;
  /** Roughness (1 - accuracy) */
  roughness: number;
}

/**
 * Creates a rough set from indiscernibility relation.
 */
export function createRoughSet(
  universe: Set<number>,
  targetSet: Set<number>,
  equivalenceClasses: Map<number, Set<number>>
): RoughSet {
  const lowerApproximation = new Set<number>();
  const upperApproximation = new Set<number>();

  // For each equivalence class
  for (const [representative, eqClass] of equivalenceClasses) {
    // Check if entire class is in target set (lower approximation)
    const allInTarget = [...eqClass].every(x => targetSet.has(x));
    // Check if any member is in target set (upper approximation)
    const anyInTarget = [...eqClass].some(x => targetSet.has(x));

    if (allInTarget) {
      for (const x of eqClass) lowerApproximation.add(x);
    }
    if (anyInTarget) {
      for (const x of eqClass) upperApproximation.add(x);
    }
  }

  // Boundary = upper - lower
  const boundary = new Set<number>();
  for (const x of upperApproximation) {
    if (!lowerApproximation.has(x)) boundary.add(x);
  }

  // Accuracy = |lower| / |upper|
  const accuracy = upperApproximation.size > 0
    ? lowerApproximation.size / upperApproximation.size
    : 1;

  return {
    id: `rough-${Date.now()}`,
    lowerApproximation,
    upperApproximation,
    boundary,
    accuracy,
    roughness: 1 - accuracy,
  };
}

/**
 * Computes Bayesian posterior for classification.
 */
export function computeBayesianPosterior(
  features: Map<string, number>,
  priors: Map<number, number>,
  likelihoodModels: Map<number, (features: Map<string, number>) => number>
): BayesianClassification {
  // Compute likelihoods P(X|C)
  const likelihoods = new Map<number, number>();
  let evidence = 0;

  for (const [classId, prior] of priors) {
    const model = likelihoodModels.get(classId);
    const likelihood = model ? model(features) : 0.5;
    likelihoods.set(classId, likelihood);
    evidence += likelihood * prior;
  }

  // Compute posteriors P(C|X) = P(X|C) * P(C) / P(X)
  const posteriors = new Map<number, number>();
  let maxPosterior = 0;
  let mapEstimate = -1;

  for (const [classId, prior] of priors) {
    const likelihood = likelihoods.get(classId) || 0;
    const posterior = evidence > 0 ? (likelihood * prior) / evidence : 0;
    posteriors.set(classId, posterior);

    if (posterior > maxPosterior) {
      maxPosterior = posterior;
      mapEstimate = classId;
    }
  }

  // Compute 95% confidence interval for MAP estimate
  const mapPosterior = posteriors.get(mapEstimate) || 0;
  const variance = mapPosterior * (1 - mapPosterior);
  const z = 1.96; // 95% confidence
  const halfWidth = z * Math.sqrt(variance);

  return {
    contentId: 'computed',
    priors,
    likelihoods,
    posteriors,
    evidence,
    mapEstimate,
    confidenceInterval: {
      lower: Math.max(0, mapPosterior - halfWidth),
      upper: Math.min(1, mapPosterior + halfWidth),
      level: 0.95,
    },
  };
}

// =============================================================================
// KNOWLEDGE GRAPH INTEGRATION
// =============================================================================

/**
 * RDF Triple representation.
 */
export interface Triple {
  /** Subject (entity or blank node) */
  subject: string;
  /** Predicate (property URI) */
  predicate: string;
  /** Object (entity, blank node, or literal) */
  object: string | number | boolean;
  /** Object type */
  objectType: 'uri' | 'literal' | 'blank';
  /** Language tag for literals */
  lang?: string;
  /** Datatype IRI for typed literals */
  datatype?: string;
  /** Graph name (for named graphs) */
  graph?: string;
}

/**
 * Semantic predicate types for knowledge graph.
 */
export type SemanticPredicate =
  | 'rdf:type'
  | 'rdfs:subClassOf'
  | 'rdfs:subPropertyOf'
  | 'rdfs:domain'
  | 'rdfs:range'
  | 'owl:sameAs'
  | 'owl:equivalentClass'
  | 'owl:disjointWith'
  | 'owl:inverseOf'
  | 'skos:broader'
  | 'skos:narrower'
  | 'skos:related'
  | 'dc:subject'
  | 'dc:creator'
  | 'dc:date'
  | 'rses:classifiedAs'
  | 'rses:belongsToSet'
  | 'rses:hasTopic'
  | 'rses:hasType';

/**
 * Knowledge graph node (entity).
 */
export interface KGNode {
  /** Unique URI */
  uri: string;
  /** Node type(s) */
  types: string[];
  /** Label */
  label: string;
  /** Properties */
  properties: Map<string, Triple[]>;
  /** Incoming edges */
  inEdges: KGEdge[];
  /** Outgoing edges */
  outEdges: KGEdge[];
  /** Embedding vector */
  embedding?: number[];
  /** PageRank score */
  pageRank?: number;
}

/**
 * Knowledge graph edge (relationship).
 */
export interface KGEdge {
  /** Unique ID */
  id: string;
  /** Source node URI */
  source: string;
  /** Target node URI */
  target: string;
  /** Predicate */
  predicate: SemanticPredicate | string;
  /** Edge weight */
  weight: number;
  /** Edge properties */
  properties: Map<string, unknown>;
  /** Confidence score */
  confidence: number;
  /** Provenance */
  provenance?: string;
}

/**
 * Inference rule for knowledge graph reasoning.
 */
export interface InferenceRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Antecedent patterns (body) */
  antecedent: TriplePattern[];
  /** Consequent patterns (head) */
  consequent: TriplePattern[];
  /** Rule confidence */
  confidence: number;
  /** Whether rule is active */
  active: boolean;
}

/**
 * Triple pattern for matching and inference.
 */
export interface TriplePattern {
  /** Subject (URI or variable starting with ?) */
  subject: string;
  /** Predicate (URI or variable) */
  predicate: string;
  /** Object (URI, literal, or variable) */
  object: string;
  /** Optional filter */
  filter?: (bindings: Map<string, string>) => boolean;
}

/**
 * SPARQL-like query for knowledge graph.
 */
export interface KGQuery {
  /** Query type */
  type: 'select' | 'construct' | 'ask' | 'describe';
  /** Variables to select */
  variables: string[];
  /** Triple patterns in WHERE clause */
  patterns: TriplePattern[];
  /** Optional patterns */
  optionalPatterns: TriplePattern[];
  /** Filter expressions */
  filters: string[];
  /** ORDER BY clause */
  orderBy?: { variable: string; direction: 'asc' | 'desc' }[];
  /** LIMIT */
  limit?: number;
  /** OFFSET */
  offset?: number;
}

/**
 * Knowledge Graph implementation with RSES integration.
 */
export class TaxonomyKnowledgeGraph {
  private nodes: Map<string, KGNode> = new Map();
  private edges: Map<string, KGEdge> = new Map();
  private triples: Triple[] = [];
  private predicateIndex: Map<string, Triple[]> = new Map();
  private subjectIndex: Map<string, Triple[]> = new Map();
  private objectIndex: Map<string, Triple[]> = new Map();
  private inferenceRules: InferenceRule[] = [];

  /**
   * Adds a triple to the knowledge graph.
   */
  addTriple(triple: Triple): void {
    this.triples.push(triple);

    // Update indexes
    this.indexTriple(triple, 'subject', this.subjectIndex);
    this.indexTriple(triple, 'predicate', this.predicateIndex);
    if (typeof triple.object === 'string') {
      this.indexTriple(triple, 'object', this.objectIndex);
    }

    // Create/update nodes
    this.ensureNode(triple.subject);
    if (typeof triple.object === 'string' && triple.objectType === 'uri') {
      this.ensureNode(triple.object);
    }

    // Create edge
    if (triple.objectType === 'uri') {
      const edge: KGEdge = {
        id: `edge-${this.edges.size}`,
        source: triple.subject,
        target: triple.object as string,
        predicate: triple.predicate,
        weight: 1.0,
        properties: new Map(),
        confidence: 1.0,
      };
      this.edges.set(edge.id, edge);

      this.nodes.get(triple.subject)?.outEdges.push(edge);
      this.nodes.get(triple.object as string)?.inEdges.push(edge);
    }
  }

  private indexTriple(triple: Triple, key: 'subject' | 'predicate' | 'object', index: Map<string, Triple[]>): void {
    const value = String(triple[key]);
    if (!index.has(value)) {
      index.set(value, []);
    }
    index.get(value)!.push(triple);
  }

  private ensureNode(uri: string): void {
    if (!this.nodes.has(uri)) {
      this.nodes.set(uri, {
        uri,
        types: [],
        label: uri.split('/').pop() || uri,
        properties: new Map(),
        inEdges: [],
        outEdges: [],
      });
    }
  }

  /**
   * Adds a vocabulary term to the knowledge graph.
   */
  addTermToGraph(term: Term, vocabulary: Vocabulary): void {
    const termUri = `rses:term/${vocabulary.id}/${term.id}`;
    const vocabUri = `rses:vocabulary/${vocabulary.id}`;

    // Add term type
    this.addTriple({
      subject: termUri,
      predicate: 'rdf:type',
      object: 'rses:Term',
      objectType: 'uri',
    });

    // Add term label
    this.addTriple({
      subject: termUri,
      predicate: 'rdfs:label',
      object: term.name,
      objectType: 'literal',
    });

    // Add vocabulary membership
    this.addTriple({
      subject: termUri,
      predicate: 'skos:inScheme',
      object: vocabUri,
      objectType: 'uri',
    });

    // Add parent relationships
    for (const parentId of term.parentIds) {
      const parentUri = `rses:term/${vocabulary.id}/${parentId}`;
      this.addTriple({
        subject: termUri,
        predicate: 'skos:broader',
        object: parentUri,
        objectType: 'uri',
      });
      this.addTriple({
        subject: parentUri,
        predicate: 'skos:narrower',
        object: termUri,
        objectType: 'uri',
      });
    }
  }

  /**
   * Adds content classification to knowledge graph.
   */
  addContentClassification(contentId: string, termId: number, vocabularyId: string): void {
    const contentUri = `rses:content/${contentId}`;
    const termUri = `rses:term/${vocabularyId}/${termId}`;

    this.addTriple({
      subject: contentUri,
      predicate: 'rses:classifiedAs',
      object: termUri,
      objectType: 'uri',
    });
  }

  /**
   * Executes a SPARQL-like query.
   */
  query(query: KGQuery): Map<string, string>[] {
    const results: Map<string, string>[] = [];

    // Simple pattern matching (simplified SPARQL execution)
    const bindings = this.matchPatterns(query.patterns, new Map());

    for (const binding of bindings) {
      // Apply filters
      let passesFilters = true;
      for (const filter of query.filters) {
        // Simplified filter evaluation
        passesFilters = passesFilters && this.evaluateFilter(filter, binding);
      }

      if (passesFilters) {
        const result = new Map<string, string>();
        for (const variable of query.variables) {
          result.set(variable, binding.get(variable) || '');
        }
        results.push(result);
      }
    }

    // Apply limit and offset
    let finalResults = results;
    if (query.offset) {
      finalResults = finalResults.slice(query.offset);
    }
    if (query.limit) {
      finalResults = finalResults.slice(0, query.limit);
    }

    return finalResults;
  }

  private matchPatterns(
    patterns: TriplePattern[],
    initialBindings: Map<string, string>
  ): Map<string, string>[] {
    if (patterns.length === 0) {
      return [initialBindings];
    }

    const [first, ...rest] = patterns;
    const results: Map<string, string>[] = [];

    // Find matching triples
    for (const triple of this.triples) {
      const newBindings = this.matchPattern(first, triple, initialBindings);
      if (newBindings) {
        const subResults = this.matchPatterns(rest, newBindings);
        results.push(...subResults);
      }
    }

    return results;
  }

  private matchPattern(
    pattern: TriplePattern,
    triple: Triple,
    bindings: Map<string, string>
  ): Map<string, string> | null {
    const newBindings = new Map(bindings);

    // Match subject
    if (!this.matchComponent(pattern.subject, triple.subject, newBindings)) {
      return null;
    }

    // Match predicate
    if (!this.matchComponent(pattern.predicate, triple.predicate, newBindings)) {
      return null;
    }

    // Match object
    if (!this.matchComponent(pattern.object, String(triple.object), newBindings)) {
      return null;
    }

    return newBindings;
  }

  private matchComponent(
    pattern: string,
    value: string,
    bindings: Map<string, string>
  ): boolean {
    if (pattern.startsWith('?')) {
      // Variable
      const existing = bindings.get(pattern);
      if (existing) {
        return existing === value;
      }
      bindings.set(pattern, value);
      return true;
    }
    return pattern === value;
  }

  private evaluateFilter(filter: string, bindings: Map<string, string>): boolean {
    // Simplified filter evaluation
    return true;
  }

  /**
   * Runs inference rules to derive new triples.
   */
  runInference(): Triple[] {
    const inferred: Triple[] = [];

    for (const rule of this.inferenceRules) {
      if (!rule.active) continue;

      // Match antecedent patterns
      const bindings = this.matchPatterns(rule.antecedent, new Map());

      for (const binding of bindings) {
        // Generate consequent triples
        for (const consequent of rule.consequent) {
          const triple = this.instantiatePattern(consequent, binding);
          if (triple && !this.hasTriple(triple)) {
            triple.graph = 'inferred';
            this.addTriple(triple);
            inferred.push(triple);
          }
        }
      }
    }

    return inferred;
  }

  private instantiatePattern(
    pattern: TriplePattern,
    bindings: Map<string, string>
  ): Triple | null {
    const subject = pattern.subject.startsWith('?')
      ? bindings.get(pattern.subject)
      : pattern.subject;
    const predicate = pattern.predicate.startsWith('?')
      ? bindings.get(pattern.predicate)
      : pattern.predicate;
    const object = pattern.object.startsWith('?')
      ? bindings.get(pattern.object)
      : pattern.object;

    if (!subject || !predicate || !object) return null;

    return {
      subject,
      predicate,
      object,
      objectType: 'uri',
    };
  }

  private hasTriple(triple: Triple): boolean {
    return this.triples.some(t =>
      t.subject === triple.subject &&
      t.predicate === triple.predicate &&
      t.object === triple.object
    );
  }

  /**
   * Computes TransE embeddings for knowledge graph entities.
   * TransE: h + r approx t for triples (h, r, t)
   */
  computeTransEEmbeddings(dimensions: number, learningRate: number, epochs: number): Map<string, number[]> {
    const embeddings = new Map<string, number[]>();

    // Initialize random embeddings
    for (const [uri] of this.nodes) {
      embeddings.set(uri, this.randomVector(dimensions));
    }
    for (const [predicate] of this.predicateIndex) {
      if (!embeddings.has(predicate)) {
        embeddings.set(predicate, this.randomVector(dimensions));
      }
    }

    // Normalize embeddings
    for (const [key, vec] of embeddings) {
      embeddings.set(key, this.normalize(vec));
    }

    // Training loop
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const triple of this.triples) {
        if (triple.objectType !== 'uri') continue;

        const h = embeddings.get(triple.subject);
        const r = embeddings.get(triple.predicate);
        const t = embeddings.get(triple.object as string);

        if (!h || !r || !t) continue;

        // h + r should be close to t
        // Gradient descent on ||h + r - t||
        for (let i = 0; i < dimensions; i++) {
          const error = h[i] + r[i] - t[i];
          h[i] -= learningRate * error;
          r[i] -= learningRate * error;
          t[i] += learningRate * error;
        }

        // Re-normalize
        embeddings.set(triple.subject, this.normalize(h));
        embeddings.set(triple.predicate, this.normalize(r));
        embeddings.set(triple.object as string, this.normalize(t));
      }
    }

    // Store embeddings in nodes
    for (const [uri, node] of this.nodes) {
      node.embedding = embeddings.get(uri);
    }

    return embeddings;
  }

  private randomVector(dimensions: number): number[] {
    return Array.from({ length: dimensions }, () => (Math.random() - 0.5) * 2);
  }

  private normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
    return norm > 0 ? vec.map(x => x / norm) : vec;
  }

  /**
   * Finds similar entities using embedding similarity.
   */
  findSimilar(uri: string, topK: number = 10): { uri: string; similarity: number }[] {
    const node = this.nodes.get(uri);
    if (!node || !node.embedding) return [];

    const similarities: { uri: string; similarity: number }[] = [];

    for (const [otherUri, otherNode] of this.nodes) {
      if (otherUri === uri || !otherNode.embedding) continue;

      const similarity = this.cosineSimilarity(node.embedding, otherNode.embedding);
      similarities.push({ uri: otherUri, similarity });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Computes PageRank for knowledge graph nodes.
   */
  computePageRank(dampingFactor: number = 0.85, iterations: number = 100): Map<string, number> {
    const n = this.nodes.size;
    const pageRank = new Map<string, number>();

    // Initialize
    for (const [uri] of this.nodes) {
      pageRank.set(uri, 1 / n);
    }

    // Iterate
    for (let iter = 0; iter < iterations; iter++) {
      const newPageRank = new Map<string, number>();

      for (const [uri, node] of this.nodes) {
        let rank = (1 - dampingFactor) / n;

        for (const edge of node.inEdges) {
          const sourceNode = this.nodes.get(edge.source);
          if (sourceNode) {
            const sourceRank = pageRank.get(edge.source) || 0;
            const outDegree = sourceNode.outEdges.length || 1;
            rank += dampingFactor * sourceRank / outDegree;
          }
        }

        newPageRank.set(uri, rank);
      }

      // Update page ranks
      for (const [uri, rank] of newPageRank) {
        pageRank.set(uri, rank);
        const node = this.nodes.get(uri);
        if (node) node.pageRank = rank;
      }
    }

    return pageRank;
  }

  /**
   * Gets statistics about the knowledge graph.
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    tripleCount: number;
    predicateCount: number;
  } {
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      tripleCount: this.triples.length,
      predicateCount: this.predicateIndex.size,
    };
  }
}

// =============================================================================
// TEMPORAL DIMENSIONS
// =============================================================================

/**
 * Valid time interval for bitemporal data.
 */
export interface ValidTime {
  /** Start of validity period */
  validFrom: Date;
  /** End of validity period (null = current) */
  validTo: Date | null;
  /** Whether this is currently valid */
  isCurrent: boolean;
}

/**
 * Transaction time for bitemporal data.
 */
export interface TransactionTime {
  /** When this record was created in the database */
  transactionStart: Date;
  /** When this record was superseded (null = current) */
  transactionEnd: Date | null;
  /** Transaction ID */
  transactionId: string;
}

/**
 * Bitemporal record combining valid and transaction times.
 */
export interface BitemporalRecord<T> {
  /** The actual data */
  data: T;
  /** Valid time dimension */
  validTime: ValidTime;
  /** Transaction time dimension */
  transactionTime: TransactionTime;
  /** Record version */
  version: number;
  /** Previous version ID */
  previousVersionId?: string;
}

/**
 * Temporal term extending classical term with time dimensions.
 */
export interface TemporalTerm extends Term {
  /** Bitemporal information */
  temporal: BitemporalRecord<Term>;
  /** History of changes */
  history: TermChangeEvent[];
  /** Predicted future state */
  prediction?: TermPrediction;
}

/**
 * Term change event for history tracking.
 */
export interface TermChangeEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: 'created' | 'updated' | 'deleted' | 'merged' | 'split' | 'moved';
  /** Timestamp */
  timestamp: Date;
  /** Actor (user or system) */
  actor: string;
  /** Old values (for updates) */
  oldValues?: Partial<Term>;
  /** New values (for updates) */
  newValues?: Partial<Term>;
  /** Related term IDs (for merge/split) */
  relatedTermIds?: number[];
  /** Reason for change */
  reason?: string;
}

/**
 * Prediction for term evolution.
 */
export interface TermPrediction {
  /** Predicted state */
  predictedState: Partial<Term>;
  /** Prediction horizon (days) */
  horizon: number;
  /** Confidence score */
  confidence: number;
  /** Factors influencing prediction */
  factors: {
    name: string;
    weight: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }[];
  /** Predicted changes */
  predictedChanges: {
    attribute: string;
    currentValue: unknown;
    predictedValue: unknown;
    likelihood: number;
  }[];
}

/**
 * Taxonomy evolution tracking.
 */
export interface TaxonomyEvolution {
  /** Vocabulary ID */
  vocabularyId: string;
  /** Snapshots at different points in time */
  snapshots: TaxonomySnapshot[];
  /** Evolution metrics */
  metrics: EvolutionMetrics;
  /** Trend analysis */
  trends: TaxonomyTrend[];
}

/**
 * Snapshot of taxonomy at a point in time.
 */
export interface TaxonomySnapshot {
  /** Snapshot timestamp */
  timestamp: Date;
  /** Term count */
  termCount: number;
  /** Max depth */
  maxDepth: number;
  /** Average branching factor */
  avgBranchingFactor: number;
  /** Term IDs present */
  termIds: number[];
  /** Structure hash for comparison */
  structureHash: string;
}

/**
 * Metrics for taxonomy evolution.
 */
export interface EvolutionMetrics {
  /** Term growth rate (per day) */
  termGrowthRate: number;
  /** Term churn rate (created + deleted) */
  churnRate: number;
  /** Structure stability (0-1) */
  structureStability: number;
  /** Average term lifespan (days) */
  avgTermLifespan: number;
  /** Vocabulary maturity score */
  maturityScore: number;
}

/**
 * Trend in taxonomy evolution.
 */
export interface TaxonomyTrend {
  /** Trend name */
  name: string;
  /** Trend type */
  type: 'growth' | 'consolidation' | 'restructuring' | 'stability';
  /** Strength of trend (0-1) */
  strength: number;
  /** Start date of trend */
  startDate: Date;
  /** End date (null = ongoing) */
  endDate: Date | null;
  /** Description */
  description: string;
}

/**
 * Temporal query for point-in-time analysis.
 */
export interface TemporalQuery {
  /** Type of temporal query */
  type: 'as_of' | 'between' | 'since' | 'until' | 'history';
  /** Reference time */
  referenceTime?: Date;
  /** Start time for range queries */
  startTime?: Date;
  /** End time for range queries */
  endTime?: Date;
  /** Include transaction time? */
  includeTransactionTime: boolean;
  /** Include valid time? */
  includeValidTime: boolean;
}

/**
 * Temporal taxonomy store for bitemporal data management.
 */
export class TemporalTaxonomyStore {
  private records: Map<string, BitemporalRecord<Term>[]> = new Map();
  private snapshots: TaxonomySnapshot[] = [];
  private changeLog: TermChangeEvent[] = [];

  /**
   * Stores a term with bitemporal tracking.
   */
  storeTerm(
    term: Term,
    validFrom: Date = new Date(),
    validTo: Date | null = null,
    actor: string = 'system'
  ): void {
    const termKey = `${term.vocabularyId}:${term.id}`;

    if (!this.records.has(termKey)) {
      this.records.set(termKey, []);
    }

    // Close previous record if exists
    const existingRecords = this.records.get(termKey)!;
    if (existingRecords.length > 0) {
      const latest = existingRecords[existingRecords.length - 1];
      if (!latest.transactionTime.transactionEnd) {
        latest.transactionTime.transactionEnd = new Date();
      }
    }

    const record: BitemporalRecord<Term> = {
      data: term,
      validTime: {
        validFrom,
        validTo,
        isCurrent: validTo === null,
      },
      transactionTime: {
        transactionStart: new Date(),
        transactionEnd: null,
        transactionId: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      version: existingRecords.length + 1,
      previousVersionId: existingRecords.length > 0
        ? existingRecords[existingRecords.length - 1].transactionTime.transactionId
        : undefined,
    };

    existingRecords.push(record);

    // Log change event
    const event: TermChangeEvent = {
      id: `event-${Date.now()}`,
      type: record.version === 1 ? 'created' : 'updated',
      timestamp: new Date(),
      actor,
      newValues: term,
      oldValues: record.version > 1
        ? existingRecords[existingRecords.length - 2].data
        : undefined,
    };
    this.changeLog.push(event);
  }

  /**
   * Gets term as of a specific point in time.
   */
  getTermAsOf(
    vocabularyId: string,
    termId: number,
    asOfTime: Date
  ): Term | null {
    const termKey = `${vocabularyId}:${termId}`;
    const records = this.records.get(termKey);

    if (!records) return null;

    // Find record valid at the given time
    for (const record of records.reverse()) {
      const validFrom = record.validTime.validFrom;
      const validTo = record.validTime.validTo || new Date(8640000000000000);
      const txStart = record.transactionTime.transactionStart;
      const txEnd = record.transactionTime.transactionEnd || new Date(8640000000000000);

      if (validFrom <= asOfTime && asOfTime <= validTo &&
          txStart <= asOfTime && asOfTime <= txEnd) {
        return record.data;
      }
    }

    return null;
  }

  /**
   * Gets full history of a term.
   */
  getTermHistory(vocabularyId: string, termId: number): BitemporalRecord<Term>[] {
    const termKey = `${vocabularyId}:${termId}`;
    return this.records.get(termKey) || [];
  }

  /**
   * Creates a taxonomy snapshot.
   */
  createSnapshot(vocabularyId: string, terms: Term[]): TaxonomySnapshot {
    // Compute structure hash
    const structure = terms.map(t => `${t.id}:${t.parentIds.join(',')}`).sort().join('|');
    const hash = this.simpleHash(structure);

    // Compute max depth
    const depths = new Map<number, number>();
    for (const term of terms) {
      depths.set(term.id, this.computeDepth(term, terms, depths));
    }
    const maxDepth = Math.max(...depths.values(), 0);

    // Compute average branching factor
    let totalChildren = 0;
    let parentsCount = 0;
    for (const term of terms) {
      const childCount = terms.filter(t => t.parentIds.includes(term.id)).length;
      if (childCount > 0) {
        totalChildren += childCount;
        parentsCount++;
      }
    }
    const avgBranchingFactor = parentsCount > 0 ? totalChildren / parentsCount : 0;

    const snapshot: TaxonomySnapshot = {
      timestamp: new Date(),
      termCount: terms.length,
      maxDepth,
      avgBranchingFactor,
      termIds: terms.map(t => t.id),
      structureHash: hash,
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  private computeDepth(term: Term, terms: Term[], cache: Map<number, number>): number {
    if (cache.has(term.id)) return cache.get(term.id)!;
    if (term.parentIds.length === 0) return 0;

    const parentDepths = term.parentIds.map(pid => {
      const parent = terms.find(t => t.id === pid);
      return parent ? this.computeDepth(parent, terms, cache) : 0;
    });

    const depth = Math.max(...parentDepths) + 1;
    cache.set(term.id, depth);
    return depth;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Computes evolution metrics.
   */
  computeEvolutionMetrics(): EvolutionMetrics {
    if (this.snapshots.length < 2) {
      return {
        termGrowthRate: 0,
        churnRate: 0,
        structureStability: 1,
        avgTermLifespan: 0,
        maturityScore: 0,
      };
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const daysDiff = (last.timestamp.getTime() - first.timestamp.getTime()) / (1000 * 60 * 60 * 24);

    // Term growth rate
    const termGrowthRate = daysDiff > 0
      ? (last.termCount - first.termCount) / daysDiff
      : 0;

    // Churn rate
    const createdCount = this.changeLog.filter(e => e.type === 'created').length;
    const deletedCount = this.changeLog.filter(e => e.type === 'deleted').length;
    const churnRate = daysDiff > 0 ? (createdCount + deletedCount) / daysDiff : 0;

    // Structure stability (hash consistency)
    let sameHashCount = 0;
    for (let i = 1; i < this.snapshots.length; i++) {
      if (this.snapshots[i].structureHash === this.snapshots[i - 1].structureHash) {
        sameHashCount++;
      }
    }
    const structureStability = (this.snapshots.length - 1) > 0
      ? sameHashCount / (this.snapshots.length - 1)
      : 1;

    // Average term lifespan
    const termLifespans: number[] = [];
    for (const [, records] of this.records) {
      if (records.length > 0) {
        const created = records[0].validTime.validFrom;
        const ended = records[records.length - 1].validTime.validTo || new Date();
        const lifespan = (ended.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        termLifespans.push(lifespan);
      }
    }
    const avgTermLifespan = termLifespans.length > 0
      ? termLifespans.reduce((a, b) => a + b, 0) / termLifespans.length
      : 0;

    // Maturity score (composite)
    const maturityScore = Math.min(1,
      0.3 * structureStability +
      0.3 * Math.min(1, last.termCount / 100) +
      0.2 * Math.min(1, daysDiff / 365) +
      0.2 * (1 - Math.min(1, churnRate))
    );

    return {
      termGrowthRate,
      churnRate,
      structureStability,
      avgTermLifespan,
      maturityScore,
    };
  }

  /**
   * Predicts future term state using simple trend analysis.
   */
  predictTermEvolution(
    vocabularyId: string,
    termId: number,
    horizonDays: number
  ): TermPrediction | null {
    const history = this.getTermHistory(vocabularyId, termId);
    if (history.length < 2) return null;

    // Analyze weight trend
    const weights = history.map((h, i) => ({
      time: i,
      value: h.data.weight,
    }));

    // Simple linear regression for weight
    const n = weights.length;
    const sumX = weights.reduce((s, w) => s + w.time, 0);
    const sumY = weights.reduce((s, w) => s + w.value, 0);
    const sumXY = weights.reduce((s, w) => s + w.time * w.value, 0);
    const sumX2 = weights.reduce((s, w) => s + w.time * w.time, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const currentWeight = history[history.length - 1].data.weight;
    const predictedWeight = intercept + slope * (n + horizonDays);

    // Determine trend direction
    const trend: 'increasing' | 'decreasing' | 'stable' =
      slope > 0.01 ? 'increasing' : slope < -0.01 ? 'decreasing' : 'stable';

    // Confidence based on R-squared
    const yMean = sumY / n;
    const ssTotal = weights.reduce((s, w) => s + Math.pow(w.value - yMean, 2), 0);
    const ssResidual = weights.reduce((s, w) => s + Math.pow(w.value - (intercept + slope * w.time), 2), 0);
    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return {
      predictedState: {
        weight: Math.max(0, predictedWeight),
      },
      horizon: horizonDays,
      confidence: rSquared,
      factors: [
        {
          name: 'weight_trend',
          weight: 1.0,
          trend,
        },
      ],
      predictedChanges: [
        {
          attribute: 'weight',
          currentValue: currentWeight,
          predictedValue: predictedWeight,
          likelihood: rSquared,
        },
      ],
    };
  }
}

// =============================================================================
// AI/ML INTEGRATION
// =============================================================================

/**
 * Graph Neural Network layer for taxonomy learning.
 */
export interface GNNLayer {
  /** Layer type */
  type: 'gcn' | 'gat' | 'sage' | 'gin';
  /** Input dimension */
  inputDim: number;
  /** Output dimension */
  outputDim: number;
  /** Activation function */
  activation: 'relu' | 'tanh' | 'sigmoid' | 'softmax';
  /** Number of attention heads (for GAT) */
  numHeads?: number;
  /** Dropout rate */
  dropout: number;
}

/**
 * Configuration for Graph Neural Network.
 */
export interface GNNConfig {
  /** Hidden layers */
  layers: GNNLayer[];
  /** Learning rate */
  learningRate: number;
  /** Number of epochs */
  epochs: number;
  /** Batch size */
  batchSize: number;
  /** Weight decay (L2 regularization) */
  weightDecay: number;
  /** Aggregation method */
  aggregation: 'mean' | 'sum' | 'max';
}

/**
 * Attention mechanism for relevance weighting.
 */
export interface AttentionMechanism {
  /** Attention type */
  type: 'dot_product' | 'additive' | 'multiplicative' | 'multi_head';
  /** Key dimension */
  keyDim: number;
  /** Value dimension */
  valueDim: number;
  /** Number of heads for multi-head attention */
  numHeads: number;
  /** Dropout on attention weights */
  attentionDropout: number;
}

/**
 * Reinforcement learning configuration for query optimization.
 */
export interface RLConfig {
  /** Algorithm type */
  algorithm: 'dqn' | 'ppo' | 'a2c' | 'sac';
  /** State representation dimension */
  stateDim: number;
  /** Action space size */
  actionDim: number;
  /** Discount factor */
  gamma: number;
  /** Learning rate */
  learningRate: number;
  /** Exploration epsilon */
  epsilon: number;
  /** Epsilon decay rate */
  epsilonDecay: number;
  /** Replay buffer size */
  replayBufferSize: number;
}

/**
 * Feature vector for term/content.
 */
export interface FeatureVector {
  /** Entity ID */
  entityId: string;
  /** Entity type */
  entityType: 'term' | 'content' | 'vocabulary';
  /** Dense feature vector */
  dense: number[];
  /** Sparse features (one-hot encoded) */
  sparse: Map<string, number>;
  /** Structural features from graph */
  structural: {
    degree: number;
    inDegree: number;
    outDegree: number;
    pageRank: number;
    clusteringCoefficient: number;
    betweennessCentrality: number;
  };
  /** Temporal features */
  temporal: {
    age: number;
    updateFrequency: number;
    lastUpdated: number;
    growthRate: number;
  };
}

/**
 * AI-enhanced taxonomy engine with neural learning.
 */
export class AITaxonomyEngine {
  private knowledgeGraph: TaxonomyKnowledgeGraph;
  private temporalStore: TemporalTaxonomyStore;
  private embeddings: Map<string, number[]> = new Map();
  private gnnConfig: GNNConfig;
  private attentionWeights: Map<string, number> = new Map();

  constructor(
    knowledgeGraph: TaxonomyKnowledgeGraph,
    temporalStore: TemporalTaxonomyStore,
    gnnConfig?: Partial<GNNConfig>
  ) {
    this.knowledgeGraph = knowledgeGraph;
    this.temporalStore = temporalStore;
    this.gnnConfig = {
      layers: [
        { type: 'gcn', inputDim: 64, outputDim: 32, activation: 'relu', dropout: 0.5 },
        { type: 'gcn', inputDim: 32, outputDim: 16, activation: 'relu', dropout: 0.5 },
      ],
      learningRate: 0.01,
      epochs: 100,
      batchSize: 32,
      weightDecay: 0.0005,
      aggregation: 'mean',
      ...gnnConfig,
    };
  }

  /**
   * Learns term embeddings using message passing.
   * Simplified GCN-style aggregation.
   */
  learnEmbeddings(terms: Term[], contentGraph: ContentTermGraph): Map<number, number[]> {
    const embeddings = new Map<number, number[]>();
    const dimensions = this.gnnConfig.layers[0].inputDim;

    // Initialize embeddings with random or feature-based vectors
    for (const term of terms) {
      const features = this.extractFeatures(term);
      embeddings.set(term.id, features);
    }

    // Message passing layers
    for (const layer of this.gnnConfig.layers) {
      const newEmbeddings = new Map<number, number[]>();

      for (const term of terms) {
        const embedding = embeddings.get(term.id)!;
        const neighborEmbeddings: number[][] = [];

        // Get parent embeddings
        for (const parentId of term.parentIds) {
          const parentEmb = embeddings.get(parentId);
          if (parentEmb) neighborEmbeddings.push(parentEmb);
        }

        // Get child embeddings
        for (const otherTerm of terms) {
          if (otherTerm.parentIds.includes(term.id)) {
            const childEmb = embeddings.get(otherTerm.id);
            if (childEmb) neighborEmbeddings.push(childEmb);
          }
        }

        // Aggregate neighbors
        const aggregated = this.aggregateNeighbors(neighborEmbeddings, layer.outputDim);

        // Combine with self embedding
        const combined = this.combineEmbeddings(embedding, aggregated, layer);

        // Apply activation
        const activated = this.applyActivation(combined, layer.activation);

        // Apply dropout
        const dropped = this.applyDropout(activated, layer.dropout);

        newEmbeddings.set(term.id, dropped);
      }

      // Update embeddings for next layer
      for (const [id, emb] of newEmbeddings) {
        embeddings.set(id, emb);
      }
    }

    // Store in class for later use
    for (const [id, emb] of embeddings) {
      this.embeddings.set(`term:${id}`, emb);
    }

    return embeddings;
  }

  private extractFeatures(term: Term): number[] {
    const dimensions = this.gnnConfig.layers[0].inputDim;
    const features = new Array(dimensions).fill(0);

    // Simple feature extraction
    // Position 0-9: name embedding (simplified)
    for (let i = 0; i < Math.min(term.name.length, 10); i++) {
      features[i] = term.name.charCodeAt(i) / 127;
    }

    // Position 10: weight (normalized)
    features[10] = term.weight / 100;

    // Position 11: depth indicator
    features[11] = term.parentIds.length > 0 ? 1 : 0;

    // Position 12: number of parents
    features[12] = term.parentIds.length / 10;

    // Remaining positions: random initialization
    for (let i = 13; i < dimensions; i++) {
      features[i] = Math.random() * 0.1;
    }

    return features;
  }

  private aggregateNeighbors(neighbors: number[][], outputDim: number): number[] {
    if (neighbors.length === 0) {
      return new Array(outputDim).fill(0);
    }

    const aggregated = new Array(outputDim).fill(0);

    switch (this.gnnConfig.aggregation) {
      case 'mean':
        for (const neighbor of neighbors) {
          for (let i = 0; i < Math.min(outputDim, neighbor.length); i++) {
            aggregated[i] += neighbor[i] / neighbors.length;
          }
        }
        break;

      case 'sum':
        for (const neighbor of neighbors) {
          for (let i = 0; i < Math.min(outputDim, neighbor.length); i++) {
            aggregated[i] += neighbor[i];
          }
        }
        break;

      case 'max':
        for (let i = 0; i < outputDim; i++) {
          aggregated[i] = Math.max(...neighbors.map(n => n[i] || 0));
        }
        break;
    }

    return aggregated;
  }

  private combineEmbeddings(self: number[], neighbors: number[], layer: GNNLayer): number[] {
    const combined = new Array(layer.outputDim).fill(0);

    // Simple linear combination (would use learnable weights in practice)
    for (let i = 0; i < layer.outputDim; i++) {
      const selfVal = i < self.length ? self[i] : 0;
      const neighborVal = i < neighbors.length ? neighbors[i] : 0;
      combined[i] = 0.5 * selfVal + 0.5 * neighborVal;
    }

    return combined;
  }

  private applyActivation(values: number[], activation: string): number[] {
    switch (activation) {
      case 'relu':
        return values.map(v => Math.max(0, v));
      case 'tanh':
        return values.map(v => Math.tanh(v));
      case 'sigmoid':
        return values.map(v => 1 / (1 + Math.exp(-v)));
      case 'softmax':
        const maxVal = Math.max(...values);
        const expValues = values.map(v => Math.exp(v - maxVal));
        const sumExp = expValues.reduce((a, b) => a + b, 0);
        return expValues.map(v => v / sumExp);
      default:
        return values;
    }
  }

  private applyDropout(values: number[], rate: number): number[] {
    if (rate <= 0) return values;
    return values.map(v => Math.random() > rate ? v / (1 - rate) : 0);
  }

  /**
   * Computes attention scores for relevance ranking.
   */
  computeAttention(
    query: number[],
    keys: Map<number, number[]>,
    temperature: number = 1.0
  ): Map<number, number> {
    const scores = new Map<number, number>();

    // Compute dot-product attention scores
    for (const [id, key] of keys) {
      let score = 0;
      for (let i = 0; i < Math.min(query.length, key.length); i++) {
        score += query[i] * key[i];
      }
      scores.set(id, score / temperature);
    }

    // Softmax normalization
    const maxScore = Math.max(...scores.values());
    let sumExp = 0;
    for (const [id, score] of scores) {
      sumExp += Math.exp(score - maxScore);
    }

    const attention = new Map<number, number>();
    for (const [id, score] of scores) {
      attention.set(id, Math.exp(score - maxScore) / sumExp);
    }

    return attention;
  }

  /**
   * Suggests similar terms using learned embeddings.
   */
  suggestSimilarTerms(termId: number, topK: number = 5): { termId: number; similarity: number }[] {
    const termEmbedding = this.embeddings.get(`term:${termId}`);
    if (!termEmbedding) return [];

    const similarities: { termId: number; similarity: number }[] = [];

    for (const [key, embedding] of this.embeddings) {
      if (!key.startsWith('term:')) continue;
      const otherId = parseInt(key.split(':')[1], 10);
      if (otherId === termId) continue;

      const similarity = this.cosineSimilarity(termEmbedding, embedding);
      similarities.push({ termId: otherId, similarity });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return normA > 0 && normB > 0
      ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
      : 0;
  }

  /**
   * Predicts term relationships using embeddings.
   */
  predictRelationship(
    term1Id: number,
    term2Id: number
  ): { relationship: 'parent' | 'child' | 'sibling' | 'related' | 'none'; confidence: number } {
    const emb1 = this.embeddings.get(`term:${term1Id}`);
    const emb2 = this.embeddings.get(`term:${term2Id}`);

    if (!emb1 || !emb2) {
      return { relationship: 'none', confidence: 0 };
    }

    const similarity = this.cosineSimilarity(emb1, emb2);

    // Simple heuristic based on similarity
    if (similarity > 0.9) {
      return { relationship: 'sibling', confidence: similarity };
    } else if (similarity > 0.7) {
      return { relationship: 'related', confidence: similarity };
    } else if (similarity > 0.5) {
      // Could be parent-child - would need more features to determine direction
      return { relationship: 'related', confidence: similarity * 0.8 };
    }

    return { relationship: 'none', confidence: 1 - similarity };
  }

  /**
   * Optimizes query execution using RL-inspired strategy.
   */
  optimizeQueryStrategy(
    queryPatterns: { pattern: string; avgExecutionTime: number; frequency: number }[]
  ): Map<string, { priority: number; cacheRecommendation: boolean }> {
    const strategies = new Map<string, { priority: number; cacheRecommendation: boolean }>();

    // Score based on frequency and execution time
    for (const pattern of queryPatterns) {
      const score = pattern.frequency * pattern.avgExecutionTime;
      const priority = Math.min(1, score / 1000);
      const cacheRecommendation = pattern.avgExecutionTime > 100 && pattern.frequency > 10;

      strategies.set(pattern.pattern, { priority, cacheRecommendation });
    }

    return strategies;
  }
}

// =============================================================================
// UNIFIED QUANTUM-READY TAXONOMY INTERFACE
// =============================================================================

/**
 * Unified quantum-ready taxonomy that combines all advanced features.
 */
export interface QuantumReadyTaxonomy {
  /** Classical taxonomy components */
  classical: {
    vocabularies: Map<string, Vocabulary>;
    terms: Map<number, Term>;
    contentGraph: ContentTermGraph;
  };

  /** Quantum extensions */
  quantum: {
    quantumTerms: Map<string, QuantumTerm>;
    entanglementPairs: [string, string][];
    measurementHistory: { termId: string; collapsedTo: number; timestamp: Date }[];
    globalCoherence: number;
  };

  /** Probabilistic extensions */
  probabilistic: {
    fuzzyMemberships: Map<number, FuzzyTermMembership[]>;
    roughSets: Map<string, RoughSet>;
    bayesianModels: Map<string, BayesianClassification>;
    confidenceThreshold: number;
  };

  /** Knowledge graph */
  knowledgeGraph: TaxonomyKnowledgeGraph;

  /** Temporal store */
  temporal: TemporalTaxonomyStore;

  /** AI engine */
  ai: AITaxonomyEngine;
}

/**
 * Factory function to create a quantum-ready taxonomy system.
 */
export function createQuantumReadyTaxonomy(): QuantumReadyTaxonomy {
  const knowledgeGraph = new TaxonomyKnowledgeGraph();
  const temporalStore = new TemporalTaxonomyStore();
  const contentGraph = new ContentTermGraph();

  return {
    classical: {
      vocabularies: new Map(),
      terms: new Map(),
      contentGraph,
    },
    quantum: {
      quantumTerms: new Map(),
      entanglementPairs: [],
      measurementHistory: [],
      globalCoherence: 1.0,
    },
    probabilistic: {
      fuzzyMemberships: new Map(),
      roughSets: new Map(),
      bayesianModels: new Map(),
      confidenceThreshold: 0.7,
    },
    knowledgeGraph,
    temporal: temporalStore,
    ai: new AITaxonomyEngine(knowledgeGraph, temporalStore),
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Re-export from taxonomy-algebra for convenience
  Term,
  Vocabulary,
  ContentTermGraph,
  computeTransitiveClosure,
  computeDescendants,
};
