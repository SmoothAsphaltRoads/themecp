import React from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { GameState } from '@/types';

interface ChessBoardProps {
  game: Chess;
  gameState: GameState;
  boardOrientation: 'white' | 'black';
  isStockfishThinking: boolean;
  isAiThinking: boolean;
}

export const ChessBoardComponent: React.FC<ChessBoardProps> = ({
  game,
  gameState,
  boardOrientation,
  isStockfishThinking,
  isAiThinking,
}) => {
  const getSquareStyles = () => {
    const styles: Record<string, React.CSSProperties> = {};
    
    // Highlight last move
    const history = game.history({ verbose: true });
    if (history.length > 0) {
      const lastMove = history[history.length - 1];
      styles[lastMove.from] = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)',
      };
      styles[lastMove.to] = {
        backgroundColor: 'rgba(255, 255, 0, 0.4)',
      };
    }
    
    // Highlight check
    if (gameState.isCheck) {
      const board = game.board();
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col];
          if (piece && piece.type === 'k' && piece.color === game.turn()) {
            const square = `${String.fromCharCode(97 + col)}${8 - row}`;
            styles[square] = {
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
            };
          }
        }
      }
    }
    
    return styles;
  };

  const getStatusIndicator = () => {
    if (isAiThinking) {
      return (
        <div className="flex items-center gap-2 text-blue-400">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium">AI thinking...</span>
        </div>
      );
    }
    if (isStockfishThinking) {
      return (
        <div className="flex items-center gap-2 text-green-400">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium">Stockfish thinking...</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-[600px] chessboard-wrapper rounded-lg overflow-hidden">
        <Chessboard
          position={game.fen()}
          boardOrientation={boardOrientation}
          areArrowsAllowed={false}
          customDarkSquareStyle={{ backgroundColor: '#779556' }}
          customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
          customSquareStyles={getSquareStyles()}
          animationDuration={200}
        />
      </div>
      
      <div className="flex items-center justify-between w-full max-w-[600px] px-4 py-2 glass-panel">
        <div className="flex items-center gap-4">
          <span className={`text-lg font-bold ${game.turn() === 'w' ? 'text-white' : 'text-slate-400'}`}>
            White
          </span>
          <span className="text-slate-500">vs</span>
          <span className={`text-lg font-bold ${game.turn() === 'b' ? 'text-white' : 'text-slate-400'}`}>
            Black
          </span>
        </div>
        
        {getStatusIndicator()}
        
        <div className="text-slate-400 text-sm">
          Move {gameState.moveNumber}
        </div>
      </div>
    </div>
  );
};
