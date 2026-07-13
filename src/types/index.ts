export interface GameSettings {
  aiPlaysWhite: boolean;
  startFen: string;
  moveDelayMs: number;
}

export interface ApiSettings {
  provider: 'openai' | 'openrouter' | 'anthropic' | 'gemini' | 'custom';
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface StockfishSettings {
  skillLevel: number;
  searchDepth: number;
  moveTimeMs: number;
  threads: number;
  hashSize: number;
}

export interface EngineInfo {
  depth: number;
  scoreCp?: number;
  scoreMate?: number;
  pv: string[];
  nodes: number;
  nps: number;
  bestMove?: string;
  isThinking: boolean;
}

export interface AiPanelInfo {
  promptSent: string;
  rawResponse: string;
  parsedMove: string | null;
  latencyMs: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  retryCount: number;
  parsingError: string | null;
}

export interface LogEntry {
  timestamp: Date;
  type: 'info' | 'error' | 'warning' | 'success' | 'debug';
  source: 'ai' | 'stockfish' | 'game' | 'system';
  message: string;
  data?: unknown;
}

export interface GameState {
  fen: string;
  pgn: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  isThreefoldRepetition: boolean;
  isFiftyMoveRule: boolean;
  isInsufficientMaterial: boolean;
  turn: 'w' | 'b';
  moveNumber: number;
  history: string[];
  capturedPieces: {
    white: string[];
    black: string[];
  };
  gameStatus: 'playing' | 'checkmate' | 'draw' | 'stalemate' | 'forfeit';
  winner?: 'w' | 'b' | 'draw';
  reason?: string;
}

export type AiProviderConfig = {
  [K in ApiSettings['provider']]: {
    name: string;
    defaultBaseUrl: string;
    defaultModel: string;
  };
};

export const AI_PROVIDER_CONFIGS: AiProviderConfig = {
  openai: {
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  openrouter: {
    name: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.1-70b-instruct',
  },
  anthropic: {
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  gemini: {
    name: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
  },
  custom: {
    name: 'Custom',
    defaultBaseUrl: '',
    defaultModel: '',
  },
};
