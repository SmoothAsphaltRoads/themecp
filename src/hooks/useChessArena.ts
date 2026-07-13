import { Chess } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameSettings, ApiSettings, StockfishSettings, GameState, EngineInfo, AiPanelInfo, LogEntry } from '@/types';
import { createChessGame, getLegalMoves, isMoveLegal, makeMove, getCapturedPieces, getGameStatus, getPGN, getFEN, getMoveNumber, getTurn, getHistory, parseUCIToSan } from '@/utils/chess';
import { callAiApi } from '@/utils/api';
import { StockfishEngine } from '@/utils/stockfish';

interface UseChessArenaReturn {
  game: Chess;
  gameState: GameState;
  stockfishInfo: EngineInfo;
  aiPanelInfo: AiPanelInfo;
  logs: LogEntry[];
  isPlaying: boolean;
  isPaused: boolean;
  isStockfishThinking: boolean;
  isAiThinking: boolean;
  boardOrientation: 'white' | 'black';
  startGame: () => void;
  stopGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  flipBoard: () => void;
  clearLogs: () => void;
  exportPGN: () => string;
  downloadPGN: () => void;
  downloadFEN: () => void;
}

export function useChessArena(
  gameSettings: GameSettings,
  apiSettings: ApiSettings,
  stockfishSettings: StockfishSettings,
  addLogExternal: (entry: Omit<LogEntry, 'timestamp'>) => void
): UseChessArenaReturn {
  const gameRef = useRef<Chess>(createChessGame(gameSettings.startFen));
  const stockfishRef = useRef<StockfishEngine | null>(null);
  const [gameState, setGameState] = useState<GameState>(() => initializeGameState(gameRef.current));
  const [stockfishInfo, setStockfishInfo] = useState<EngineInfo>({
    depth: 0,
    pv: [],
    nodes: 0,
    nps: 0,
    isThinking: false,
  });
  const [aiPanelInfo, setAiPanelInfo] = useState<AiPanelInfo>({
    promptSent: '',
    rawResponse: '',
    parsedMove: null,
    latencyMs: 0,
    retryCount: 0,
    parsingError: null,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStockfishThinking, setIsStockfishThinking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
    gameSettings.aiPlaysWhite ? 'black' : 'white'
  );

  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const addLog = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date(),
    };
    setLogs((prev) => [...prev.slice(-99), logEntry]);
    addLogExternal(entry);
  }, [addLogExternal]);

  function initializeGameState(game: Chess): GameState {
    const status = getGameStatus(game);
    return {
      fen: getFEN(game),
      pgn: getPGN(game),
      ...status,
      turn: getTurn(game),
      moveNumber: getMoveNumber(game),
      history: getHistory(game),
      capturedPieces: getCapturedPieces(game),
      gameStatus: 'playing',
    };
  }

  const updateGameState = useCallback(() => {
    const game = gameRef.current;
    const status = getGameStatus(game);
    let gameStatus: GameState['gameStatus'] = 'playing';
    let winner: GameState['winner'] = undefined;
    let reason: string | undefined;

    if (status.isCheckmate) {
      gameStatus = 'checkmate';
      winner = game.turn() === 'w' ? 'b' : 'w';
      reason = 'Checkmate';
    } else if (status.isStalemate) {
      gameStatus = 'stalemate';
      winner = 'draw';
      reason = 'Stalemate';
    } else if (status.isDraw || status.isThreefoldRepetition || status.isFiftyMoveRule || status.isInsufficientMaterial) {
      gameStatus = 'draw';
      winner = 'draw';
      reason = status.isThreefoldRepetition ? 'Threefold repetition' :
               status.isFiftyMoveRule ? '50-move rule' :
               status.isInsufficientMaterial ? 'Insufficient material' : 'Draw';
    }

    setGameState({
      fen: getFEN(game),
      pgn: getPGN(game),
      ...status,
      turn: getTurn(game),
      moveNumber: getMoveNumber(game),
      history: getHistory(game),
      capturedPieces: getCapturedPieces(game),
      gameStatus,
      winner,
      reason,
    });
  }, []);

  const executeStockfishMove = useCallback(async () => {
    if (!stockfishRef.current || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    setIsStockfishThinking(true);

    const game = gameRef.current;
    const fen = getFEN(game);
    
    stockfishRef.current.setPosition(fen);
    stockfishRef.current.go(stockfishSettings.searchDepth, stockfishSettings.moveTimeMs);
  }, [stockfishSettings.searchDepth, stockfishSettings.moveTimeMs]);

  const executeAiMove = useCallback(async (): Promise<boolean> => {
    if (isProcessingRef.current) return false;
    
    isProcessingRef.current = true;
    setIsAiThinking(true);

    const game = gameRef.current;
    const fen = getFEN(game);
    const legalMoves = getLegalMoves(game);

    const prompt = `You are playing a competitive chess game.

Current FEN:
${fen}

Legal moves in UCI notation:
${legalMoves.join(', ')}

Return ONLY one legal move in UCI notation.`;

    setAiPanelInfo((prev) => ({
      ...prev,
      promptSent: prompt,
      retryCount: 0,
      parsingError: null,
    }));

    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await callAiApi(apiSettings, fen, legalMoves, addLog);
      
      setAiPanelInfo((prev) => ({
        ...prev,
        rawResponse: result.rawResponse,
        parsedMove: result.move,
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
        retryCount: attempt,
        parsingError: result.error || (result.move === null ? 'Could not parse valid move from response' : null),
      }));

      if (result.move && isMoveLegal(game, result.move)) {
        setIsAiThinking(false);
        isProcessingRef.current = false;
        return true;
      }

      addLog({
        type: 'warning',
        source: 'ai',
        message: `AI returned illegal move (attempt ${attempt + 1}/3)`,
        data: { move: result.move, legalMoves },
      });
    }

    setIsAiThinking(false);
    isProcessingRef.current = false;
    return false;
  }, [apiSettings, addLog]);

  const processNextMove = useCallback(async () => {
    if (!isPlaying || isPaused) return;
    
    const game = gameRef.current;
    const status = getGameStatus(game);
    
    if (status.isCheckmate || status.isDraw || status.isStalemate) {
      updateGameState();
      setIsPlaying(false);
      return;
    }

    const turn = getTurn(game);
    const aiIsWhite = gameSettings.aiPlaysWhite;
    const isAiTurn = (turn === 'w' && aiIsWhite) || (turn === 'b' && !aiIsWhite);

    if (isAiTurn) {
      const success = await executeAiMove();
      if (success) {
        const move = aiPanelInfo.parsedMove;
        if (move && isMoveLegal(game, move)) {
          makeMove(game, move);
          updateGameState();
          
          if (!getGameStatus(game).isCheckmate && !getGameStatus(game).isDraw) {
            moveTimeoutRef.current = setTimeout(() => {
              executeStockfishMove();
            }, gameSettings.moveDelayMs);
          }
        }
      } else {
        // AI forfeit
        setGameState((prev) => ({
          ...prev,
          gameStatus: 'forfeit',
          winner: turn === 'w' ? 'b' : 'w',
          reason: 'AI forfeited (invalid moves)',
        }));
        setIsPlaying(false);
        addLog({
          type: 'error',
          source: 'game',
          message: 'AI forfeited the game',
        });
      }
    }
  }, [isPlaying, isPaused, gameSettings, aiPanelInfo.parsedMove, executeAiMove, executeStockfishMove, updateGameState, addLog]);

  // Handle Stockfish best move
  useEffect(() => {
    const handleBestMove = (move: string) => {
      setIsStockfishThinking(false);
      isProcessingRef.current = false;

      const game = gameRef.current;
      if (isMoveLegal(game, move)) {
        makeMove(game, move);
        updateGameState();
        
        addLog({
          type: 'info',
          source: 'stockfish',
          message: 'Stockfish moved',
          data: { move },
        });

        if (!getGameStatus(game).isCheckmate && !getGameStatus(game).isDraw && isPlaying && !isPaused) {
          moveTimeoutRef.current = setTimeout(() => {
            processNextMove();
          }, gameSettings.moveDelayMs);
        }
      }
    };

    const handleInfoUpdate = (info: EngineInfo) => {
      setStockfishInfo(info);
      setIsStockfishThinking(info.isThinking);
    };

    // Initialize Stockfish
    const initStockfish = async () => {
      const engine = new StockfishEngine();
      const success = await engine.initialize(stockfishSettings, handleInfoUpdate, handleBestMove, addLog);
      
      if (success) {
        stockfishRef.current = engine;
        addLog({
          type: 'success',
          source: 'system',
          message: 'Stockfish engine ready',
        });
      } else {
        addLog({
          type: 'error',
          source: 'system',
          message: 'Failed to initialize Stockfish',
        });
      }
    };

    initStockfish();

    return () => {
      if (stockfishRef.current) {
        stockfishRef.current.terminate();
      }
      if (moveTimeoutRef.current) {
        clearTimeout(moveTimeoutRef.current);
      }
    };
  }, []);

  // Update Stockfish settings when they change
  useEffect(() => {
    if (stockfishRef.current) {
      stockfishRef.current.updateSettings(stockfishSettings);
    }
  }, [stockfishSettings]);

  // Process moves when game state changes
  useEffect(() => {
    if (isPlaying && !isPaused && !isStockfishThinking && !isAiThinking) {
      processNextMove();
    }
  }, [isPlaying, isPaused, isStockfishThinking, isAiThinking, gameState.fen]);

  const startGame = useCallback(() => {
    gameRef.current = createChessGame(gameSettings.startFen);
    updateGameState();
    setIsPlaying(true);
    setIsPaused(false);
    setBoardOrientation(gameSettings.aiPlaysWhite ? 'black' : 'white');
    
    addLog({
      type: 'info',
      source: 'game',
      message: 'New game started',
      data: { fen: gameSettings.startFen, aiPlaysWhite: gameSettings.aiPlaysWhite },
    });

    // If Stockfish plays white, it moves first
    if (!gameSettings.aiPlaysWhite) {
      setTimeout(() => {
        executeStockfishMove();
      }, 500);
    } else {
      // AI plays white, start the loop
      setTimeout(() => {
        processNextMove();
      }, 500);
    }
  }, [gameSettings, updateGameState, addLog, executeStockfishMove, processNextMove]);

  const stopGame = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(false);
    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
    }
    isProcessingRef.current = false;
    
    addLog({
      type: 'info',
      source: 'game',
      message: 'Game stopped',
    });
  }, [addLog]);

  const pauseGame = useCallback(() => {
    setIsPaused(true);
    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
    }
    
    addLog({
      type: 'info',
      source: 'game',
      message: 'Game paused',
    });
  }, [addLog]);

  const resumeGame = useCallback(() => {
    setIsPaused(false);
    
    addLog({
      type: 'info',
      source: 'game',
      message: 'Game resumed',
    });
  }, [addLog]);

  const flipBoard = useCallback(() => {
    setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const exportPGN = useCallback(() => {
    return getPGN(gameRef.current);
  }, []);

  const downloadPGN = useCallback(() => {
    const pgn = getPGN(gameRef.current);
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game.pgn';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadFEN = useCallback(() => {
    const fen = getFEN(gameRef.current);
    const blob = new Blob([fen], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'position.fen';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    game: gameRef.current,
    gameState,
    stockfishInfo,
    aiPanelInfo,
    logs,
    isPlaying,
    isPaused,
    isStockfishThinking,
    isAiThinking,
    boardOrientation,
    startGame,
    stopGame,
    pauseGame,
    resumeGame,
    flipBoard,
    clearLogs,
    exportPGN,
    downloadPGN,
    downloadFEN,
  };
}
