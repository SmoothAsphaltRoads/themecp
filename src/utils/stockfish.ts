import { StockfishSettings, EngineInfo, LogEntry } from '@/types';

export class StockfishEngine {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private currentInfo: EngineInfo = {
    depth: 0,
    pv: [],
    nodes: 0,
    nps: 0,
    isThinking: false,
  };
  private onInfoUpdate: ((info: EngineInfo) => void) | null = null;
  private onBestMove: ((move: string) => void) | null = null;
  private addLog: ((entry: Omit<LogEntry, 'timestamp'>) => void) | null = null;

  constructor() {}

  public async initialize(
    settings: StockfishSettings,
    onInfoUpdate: (info: EngineInfo) => void,
    onBestMove: (move: string) => void,
    addLog: (entry: Omit<LogEntry, 'timestamp'>) => void
  ): Promise<boolean> {
    this.onInfoUpdate = onInfoUpdate;
    this.onBestMove = onBestMove;
    this.addLog = addLog;

    return new Promise((resolve) => {
      try {
        // Create worker from the public file
        const workerUrl = new URL('/stockfish.js', window.location.origin);
        this.worker = new Worker(workerUrl);

        this.worker.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.worker.onerror = (error) => {
          addLog({
            type: 'error',
            source: 'stockfish',
            message: 'Worker error',
            data: { error: error.message },
          });
          resolve(false);
        };

        // Initialize UCI protocol
        this.send('uci');
        
        // Wait for uciok response with timeout
        const timeout = setTimeout(() => {
          addLog({
            type: 'error',
            source: 'stockfish',
            message: 'Stockfish initialization timeout',
          });
          resolve(false);
        }, 10000);

        const checkReady = () => {
          if (this.isReady) {
            clearTimeout(timeout);
            this.configure(settings);
            resolve(true);
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      } catch (error) {
        addLog({
          type: 'error',
          source: 'stockfish',
          message: 'Failed to initialize Stockfish',
          data: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        resolve(false);
      }
    });
  }

  private handleMessage(message: string): void {
    if (!this.addLog) return;

    // Add raw output to logs (debug level)
    this.addLog({
      type: 'debug',
      source: 'stockfish',
      message: 'Stockfish output',
      data: { output: message },
    });

    if (message === 'uciok') {
      this.isReady = true;
      this.addLog({
        type: 'success',
        source: 'stockfish',
        message: 'Stockfish initialized successfully',
      });
    } else if (message === 'readyok') {
      // Ready confirmation
    } else if (message.startsWith('bestmove')) {
      const parts = message.split(' ');
      const bestMove = parts[1];
      this.currentInfo.isThinking = false;
      this.currentInfo.bestMove = bestMove;
      
      if (bestMove && bestMove !== '(none)' && this.onBestMove) {
        this.onBestMove(bestMove);
      }
      
      this.notifyInfoUpdate();
    } else if (message.startsWith('info')) {
      this.parseInfoMessage(message);
    }
  }

  private parseInfoMessage(message: string): void {
    const parts = message.split(' ');
    
    for (let i = 0; i < parts.length; i++) {
      switch (parts[i]) {
        case 'depth':
          this.currentInfo.depth = parseInt(parts[i + 1], 10) || 0;
          break;
        case 'score':
          if (parts[i + 1] === 'cp') {
            this.currentInfo.scoreCp = parseInt(parts[i + 2], 10) || 0;
            // Adjust score based on whose turn it is (Stockfish always reports from its perspective)
          } else if (parts[i + 1] === 'mate') {
            this.currentInfo.scoreMate = parseInt(parts[i + 2], 10) || 0;
          }
          break;
        case 'pv':
          const pvStart = i + 1;
          this.currentInfo.pv = parts.slice(pvStart).filter((p) => p && !p.startsWith('#'));
          break;
        case 'nodes':
          this.currentInfo.nodes = parseInt(parts[i + 1], 10) || 0;
          break;
        case 'nps':
          this.currentInfo.nps = parseInt(parts[i + 1], 10) || 0;
          break;
      }
    }
    
    this.notifyInfoUpdate();
  }

  private notifyInfoUpdate(): void {
    if (this.onInfoUpdate) {
      this.onInfoUpdate({ ...this.currentInfo });
    }
  }

  private configure(settings: StockfishSettings): void {
    this.send(`setoption name Skill Level value ${settings.skillLevel}`);
    this.send(`setoption name Threads value ${settings.threads}`);
    this.send(`setoption name Hash value ${settings.hashSize}`);
    this.send('ucinewgame');
  }

  public updateSettings(settings: StockfishSettings): void {
    if (this.worker && this.isReady) {
      this.configure(settings);
    }
  }

  public setPosition(fen: string): void {
    if (this.worker && this.isReady) {
      this.send(`position fen ${fen}`);
    }
  }

  public go(depth?: number, moveTime?: number): void {
    if (this.worker && this.isReady) {
      this.currentInfo.isThinking = true;
      this.currentInfo.pv = [];
      this.currentInfo.bestMove = undefined;
      this.notifyInfoUpdate();
      
      if (depth !== undefined) {
        this.send(`go depth ${depth}`);
      } else if (moveTime !== undefined) {
        this.send(`go movetime ${moveTime}`);
      } else {
        this.send('go depth 15');
      }
    }
  }

  public stop(): void {
    if (this.worker) {
      this.send('stop');
    }
  }

  private send(command: string): void {
    if (this.worker) {
      this.worker.postMessage(command);
    }
  }

  public terminate(): void {
    if (this.worker) {
      this.send('quit');
      this.worker.terminate();
      this.worker = null;
      this.isReady = false;
    }
  }

  public getIsReady(): boolean {
    return this.isReady;
  }

  public getCurrentInfo(): EngineInfo {
    return { ...this.currentInfo };
  }
}
