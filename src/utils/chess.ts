import { Chess, Move } from 'chess.js';

export function createChessGame(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

export function getLegalMoves(game: Chess): string[] {
  return game.moves({ strict: false });
}

export function isMoveLegal(game: Chess, move: string): boolean {
  try {
    const moves = game.moves({ strict: false });
    return moves.includes(move);
  } catch {
    return false;
  }
}

export function makeMove(game: Chess, move: string): Move | null {
  try {
    return game.move(move);
  } catch {
    return null;
  }
}

export function getCapturedPieces(game: Chess): { white: string[]; black: string[] } {
  const board = game.board();
  const startingMaterial = {
    p: 8, n: 2, b: 2, r: 2, q: 1, k: 1,
  };
  
  const currentMaterial = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };

  board.forEach((row) => {
    row.forEach((piece) => {
      if (piece) {
        currentMaterial[piece.color][piece.type]++;
      }
    });
  });

  const capturedWhite: string[] = [];
  const capturedBlack: string[] = [];

  for (const type of ['p', 'n', 'b', 'r', 'q'] as const) {
    const whiteMissing = startingMaterial[type] - currentMaterial.white[type];
    const blackMissing = startingMaterial[type] - currentMaterial.black[type];

    for (let i = 0; i < whiteMissing; i++) {
      capturedWhite.push(type);
    }
    for (let i = 0; i < blackMissing; i++) {
      capturedBlack.push(type);
    }
  }

  return { white: capturedWhite, black: capturedBlack };
}

export function getGameStatus(game: Chess): {
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
  isThreefoldRepetition: boolean;
  isFiftyMoveRule: boolean;
  isInsufficientMaterial: boolean;
} {
  return {
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isDraw: game.isDraw(),
    isStalemate: game.isStalemate(),
    isThreefoldRepetition: game.isThreefoldRepetition(),
    isFiftyMoveRule: game.isFiftyMoves(),
    isInsufficientMaterial: game.isInsufficientMaterial(),
  };
}

export function getPGN(game: Chess): string {
  return game.pgn();
}

export function getFEN(game: Chess): string {
  return game.fen();
}

export function getMoveNumber(game: Chess): number {
  return game.moveNumber;
}

export function getTurn(game: Chess): 'w' | 'b' {
  return game.turn();
}

export function getHistory(game: Chess): string[] {
  return game.history();
}

export function resetGame(game: Chess, fen?: string): void {
  if (fen) {
    game.load(fen);
  } else {
    game.reset();
  }
}

export function parseUCIToSan(game: Chess, uciMove: string): string | null {
  try {
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

    const moves = game.moves({ verbose: true });
    const matchingMove = moves.find((m) => {
      const moveFrom = m.from;
      const moveTo = m.to;
      const movePromotion = m.promotion;

      if (moveFrom !== from || moveTo !== to) return false;
      if (promotion && movePromotion !== promotion) return false;
      if (!promotion && movePromotion) return false;

      return true;
    });

    return matchingMove?.san || null;
  } catch {
    return null;
  }
}
