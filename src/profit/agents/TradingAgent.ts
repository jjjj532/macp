import { Task } from '../../core/types';
import { v4 as uuidv4 } from 'uuid';

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: Date;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  status: 'pending' | 'filled' | 'cancelled';
  pnl?: number;
  timestamp: Date;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  strength: number;
  price: number;
  targetPrice?: number;
  stopLoss?: number;
  reason: string;
  timestamp: Date;
}

export interface TradingConfig {
  strategy: 'grid' | 'trend' | 'arbitrage' | 'mean_reversion';
  symbols: string[];
  maxPositionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskPerTrade: number;
}

export class TradingAgent {
  private config: TradingConfig;
  private positions: Map<string, Position> = new Map();
  private trades: Map<string, Trade> = new Map();
  private signals: TradingSignal[] = [];
  private balance: number = 10000;
  private initialBalance: number = 10000;

  constructor(config: Partial<TradingConfig> = {}) {
    this.config = {
      strategy: config.strategy || 'trend',
      symbols: config.symbols || ['BTC', 'ETH', 'SOL'],
      maxPositionSize: config.maxPositionSize || 1000,
      stopLoss: config.stopLoss || 0.05,
      takeProfit: config.takeProfit || 0.15,
      riskPerTrade: config.riskPerTrade || 0.02,
    };
  }

  async fetchMarketData(symbol: string): Promise<MarketData> {
    const basePrice: Record<string, number> = {
      BTC: 45000 + Math.random() * 5000,
      ETH: 2500 + Math.random() * 500,
      SOL: 100 + Math.random() * 20,
    };

    const price = basePrice[symbol] || 100;
    const change = (Math.random() - 0.5) * 10;

    return {
      symbol,
      price,
      change24h: change,
      volume24h: Math.random() * 1000000000,
      timestamp: new Date(),
    };
  }

  async analyze(symbol: string): Promise<{
    trend: 'bullish' | | 'neutral';
    strength: number 'bearish';
    indicators: Record<string, number>;
  }> {
    const data = await this.fetchMarketData(symbol);
    
    const trend = data.change24h > 2 ? 'bullish' : data.change24h < -2 ? 'bearish' : 'neutral';
    const strength = Math.abs(data.change24h) / 10;

    return {
      trend,
      strength,
      indicators: {
        rsi: 50 + (Math.random() - 0.5) * 40,
        macd: Math.random() - 0.5,
        movingAverage: data.price * (0.95 + Math.random() * 0.1),
      },
    };
  }

  async generateSignal(symbol: string): Promise<TradingSignal> {
    const analysis = await this.analyze(symbol);
    const data = await this.fetchMarketData(symbol);

    let action: 'buy' | 'sell' | 'hold' = 'hold';
    
    switch (this.config.strategy) {
      case 'trend':
        if (analysis.trend === 'bullish' && analysis.strength > 0.3) action = 'buy';
        else if (analysis.trend === 'bearish' && analysis.strength > 0.3) action = 'sell';
        break;
      case 'grid':
        action = Math.random() > 0.5 ? 'buy' : 'sell';
        break;
      case 'mean_reversion':
        const indicators = analysis.indicators;
        if (data.price < indicators.movingAverage * 0.95) action = 'buy';
        else if (data.price > indicators.movingAverage * 1.05) action = 'sell';
        break;
    }

    const signal: TradingSignal = {
      id: uuidv4(),
      symbol,
      action,
      strength: analysis.strength,
      price: data.price,
      targetPrice: data.price * (1 + this.config.takeProfit),
      stopLoss: data.price * (1 - this.config.stopLoss),
      reason: `${analysis.trend}趋势，强度${(analysis.strength * 100).toFixed(0)}%`,
      timestamp: new Date(),
    };

    this.signals.push(signal);
    return signal;
  }

  async executeTrade(signal: TradingSignal): Promise<Trade | null> {
    if (signal.action === 'hold') return null;

    const position = this.positions.get(signal.symbol);
    const positionValue = position ? position.quantity * signal.price : 0;
    
    if (signal.action === 'buy' && positionValue >= this.config.maxPositionSize) {
      throw new Error('Max position size reached');
    }

    const quantity = (this.balance * this.config.riskPerTrade) / signal.price;
    
    const trade: Trade = {
      id: uuidv4(),
      symbol: signal.symbol,
      side: signal.action,
      quantity,
      price: signal.price,
      total: quantity * signal.price,
      status: 'filled',
      timestamp: new Date(),
    };

    this.balance -= trade.total;
    this.trades.set(trade.id, trade);

    if (signal.action === 'buy') {
      const existingPosition = this.positions.get(signal.symbol);
      if (existingPosition) {
        const newQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = (existingPosition.avgPrice * existingPosition.quantity + signal.price * quantity) / newQuantity;
        this.positions.set(signal.symbol, {
          symbol: signal.symbol,
          quantity: newQuantity,
          avgPrice: newAvgPrice,
          currentPrice: signal.price,
          pnl: 0,
          pnlPercent: 0,
        });
      } else {
        this.positions.set(signal.symbol, {
          symbol: signal.symbol,
          quantity,
          avgPrice: signal.price,
          currentPrice: signal.price,
          pnl: 0,
          pnlPercent: 0,
        });
      }
    } else if (signal.action === 'sell' && position) {
      const sellQuantity = Math.min(quantity, position.quantity);
      const pnl = (signal.price - position.avgPrice) * sellQuantity;
      
      trade.pnl = pnl;
      this.balance += sellQuantity * signal.price + pnl;
      
      if (position.quantity > sellQuantity) {
        this.positions.set(signal.symbol, {
          ...position,
          quantity: position.quantity - sellQuantity,
          currentPrice: signal.price,
        });
      } else {
        this.positions.delete(signal.symbol);
      }
    }

    return trade;
  }

  async updatePositions(): Promise<Position[]> {
    const updatedPositions: Position[] = [];

    for (const [symbol, position] of this.positions) {
      const data = await this.fetchMarketData(symbol);
      const pnl = (data.price - position.avgPrice) * position.quantity;
      const pnlPercent = ((data.price - position.avgPrice) / position.avgPrice) * 100;

      const updated: Position = {
        ...position,
        currentPrice: data.price,
        pnl,
        pnlPercent,
      };

      this.positions.set(symbol, updated);
      updatedPositions.push(updated);

      if (pnlPercent < -this.config.stopLoss * 100 || pnlPercent > this.config.takeProfit * 100) {
        await this.generateSignal(symbol);
      }
    }

    return updatedPositions;
  }

  getPortfolioValue(): number {
    let positionValue = 0;
    for (const position of this.positions.values()) {
      positionValue += position.quantity * position.currentPrice;
    }
    return this.balance + positionValue;
  }

  getTotalPnL(): number {
    return this.getPortfolioValue() - this.initialBalance;
  }

  getTotalPnLPercent(): number {
    return ((this.getTotalPnL() / this.initialBalance) * 100);
  }

  getRecentTrades(limit: number = 10): Trade[] {
    return Array.from(this.trades.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getSignals(limit: number = 10): TradingSignal[] {
    return this.signals.slice(-limit);
  }

  getBalance(): number {
    return this.balance;
  }

  getConfig(): TradingConfig {
    return this.config;
  }

  updateConfig(updates: Partial<TradingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  reset(): void {
    this.positions.clear();
    this.trades.clear();
    this.signals = [];
    this.balance = this.initialBalance;
  }
}
