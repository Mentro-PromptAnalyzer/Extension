export type PromptIntent = 'delegation' | 'curiosity' | 'collaborative' | 'verification';

export interface IntentScores {
  delegation: number;
  curiosity: number;
  collaborative: number;
  verification: number;
}

export interface QualityScores {
  autonomy: number;
  curiosity: number;
  criticalThinking: number;
  specificity: number;
  context: number;
  iteration: number;
}
