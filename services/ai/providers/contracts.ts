export type DeterministicProviderName = 'groq';

export interface StructuredOutputRequest {
  system: string;
  user: string;
  context: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StructuredOutputResult {
  provider: DeterministicProviderName;
  model: string;
  rawText: string;
  parsed: unknown | null;
}

export interface DeterministicLLMProvider {
  readonly name: DeterministicProviderName;
  generateStructured(request: StructuredOutputRequest): Promise<StructuredOutputResult>;
}

