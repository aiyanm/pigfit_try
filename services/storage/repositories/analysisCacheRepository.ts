export interface AnalysisCacheEntry<T> {
  key: string;
  value: T;
  updatedAt: number;
}

export const analysisCacheRepository = {
  inMemory: new Map<string, AnalysisCacheEntry<unknown>>(),
};
