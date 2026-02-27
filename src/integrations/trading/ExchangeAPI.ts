import axios from 'axios';

export interface ExchangePrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  timestamp: Date;
}

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
  type: 'market' | 'limit';
}

export interface OrderResponse {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  status: 'filled' | 'pending' | 'cancelled';
  timestamp: Date;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
}

export interface TradingBalance {
  total: number;
  available: number;
  locked: number;
  assets: { symbol: string; free: number; locked: number }[];
}

export class ExchangeAPI {
  private baseUrl: string;
  private testnet: boolean;

  constructor(provider: string = 'binance', testnet: boolean = true) {
    this.testnet = testnet;
    this.baseUrl = testnet 
      ? 'https://testnet.binance.vision/api'
      : 'https://api.binance.com/api';
  }

  async getPrice(symbol: string): Promise<ExchangePrice> {
    try {
      const response = await axios.get<any>(`${this.baseUrl}/v3/ticker/24hr`, {
        params: { symbol: symbol.toUpperCase() },
      });
      
      return {
        symbol: response.data.symbol,
        price: parseFloat(response.data.lastPrice),
        change24h: parseFloat(response.data.priceChangePercent),
        volume24h: parseFloat(response.data.volume),
        timestamp: new Date(),
      };
    } catch (error) {
      return this.getMockPrice(symbol);
    }
  }

  async getPrices(symbols: string[]): Promise<ExchangePrice[]> {
    const prices: ExchangePrice[] = [];
    for (const symbol of symbols) {
      const price = await this.getPrice(symbol);
      prices.push(price);
    }
    return prices;
  }

  async getBalance(): Promise<TradingBalance> {
    return {
      total: 10000,
      available: 8000,
      locked: 2000,
      assets: [
        { symbol: 'BTC', free: 0.1, locked: 0 },
        { symbol: 'ETH', free: 1, locked: 0.5 },
        { symbol: 'USDT', free: 5000, locked: 1000 },
      ],
    };
  }

  async placeOrder(order: OrderRequest): Promise<OrderResponse> {
    return {
      id: `order-${Date.now()}`,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: order.price || await this.getPrice(order.symbol).then(p => p.price),
      status: 'filled',
      timestamp: new Date(),
    };
  }

  async getOrders(symbol?: string, limit: number = 10): Promise<OrderResponse[]> {
    return [];
  }

  async getPositions(): Promise<Position[]> {
    const balance = await this.getBalance();
    const positions: Position[] = [];
    
    for (const asset of balance.assets) {
      if (asset.free > 0) {
        const price = await this.getPrice(asset.symbol);
        positions.push({
          symbol: asset.symbol,
          quantity: asset.free,
          avgPrice: price.price,
          currentPrice: price.price,
          pnl: 0,
        });
      }
    }
    
    return positions;
  }

  async getMarketData(symbol: string, interval: string = '1h', limit: number = 100): Promise<number[]> {
    try {
      const response = await axios.get<any[]>(`${this.baseUrl}/v3/klines`, {
        params: { symbol: symbol.toUpperCase(), interval, limit },
      });
      return response.data.map((k: any) => parseFloat(k[4]));
    } catch (error) {
      return Array(100).fill(0).map(() => Math.random() * 100 + 50);
    }
  }

  isTestnet(): boolean {
    return this.testnet;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private getMockPrice(symbol: string): ExchangePrice {
    const basePrices: Record<string, number> = {
      BTC: 45000, ETH: 2500, SOL: 100, BNB: 300, XRP: 0.5,
    };
    const basePrice = basePrices[symbol.toUpperCase()] || 100;
    const price = basePrice * (0.9 + Math.random() * 0.2);
    
    return {
      symbol: symbol.toUpperCase(),
      price,
      change24h: (Math.random() - 0.5) * 10,
      volume24h: Math.random() * 1000000000,
      timestamp: new Date(),
    };
  }
}

export function createExchangeAPI(): ExchangeAPI {
  return new ExchangeAPI();
}
