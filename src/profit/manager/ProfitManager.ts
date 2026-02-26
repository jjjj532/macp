import { Task } from '../../core/types';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export type ProfitMode = 'content_ads' | 'ecommerce' | 'trading' | 'saas';

export interface RevenueSource {
  id: string;
  name: string;
  type: 'ads' | 'sales' | 'trading' | 'subscription' | 'api_call';
  amount: number;
  currency: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface CostItem {
  id: string;
  category: 'infrastructure' | 'api' | 'content' | 'marketing' | 'other';
  amount: number;
  description: string;
  timestamp: Date;
}

export interface ProfitReport {
  id: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  revenue: number;
  costs: number;
  profit: number;
  profitMargin: number;
  transactions: RevenueSource[];
  breakdown: {
    bySource: Record<string, number>;
    byAgent: Record<string, number>;
  };
}

export interface Settlement {
  id: string;
  agentId: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
  method: 'bank_transfer' | 'crypto' | 'credit';
}

export interface ProfitConfig {
  mode: ProfitMode;
  minPayoutThreshold: number;
  autoPayout: boolean;
  payoutSchedule: 'daily' | 'weekly' | 'monthly';
  currency: string;
  riskLimits: {
    maxDailyLoss: number;
    maxPositionSize: number;
    emergencyStopLoss: number;
  };
}

export class ProfitManager extends EventEmitter {
  private revenues: Map<string, RevenueSource> = new Map();
  private costs: Map<string, CostItem> = new Map();
  private settlements: Map<string, Settlement> = new Map();
  private config: ProfitConfig;
  private runningProfit: number = 0;
  private dailyRevenue: Map<string, number> = new Map();
  private dailyCosts: Map<string, number> = new Map();

  constructor(config: Partial<ProfitConfig> = {}) {
    super();
    this.config = {
      mode: config.mode || 'content_ads',
      minPayoutThreshold: config.minPayoutThreshold || 10,
      autoPayout: config.autoPayout || false,
      payoutSchedule: config.payoutSchedule || 'weekly',
      currency: config.currency || 'USD',
      riskLimits: config.riskLimits || {
        maxDailyLoss: 100,
        maxPositionSize: 50,
        emergencyStopLoss: 200,
      },
    };
  }

  async trackRevenue(source: Omit<RevenueSource, 'id' | 'timestamp'>): Promise<RevenueSource> {
    const revenue: RevenueSource = {
      ...source,
      id: uuidv4(),
      timestamp: new Date(),
    };
    
    this.revenues.set(revenue.id, revenue);
    this.runningProfit += revenue.amount;
    
    const today = this.getDateKey(new Date());
    const current = this.dailyRevenue.get(today) || 0;
    this.dailyRevenue.set(today, current + revenue.amount);
    
    this.emit('revenue:added', revenue);
    this.checkRiskLimits();
    
    return revenue;
  }

  async trackCost(cost: Omit<CostItem, 'id' | 'timestamp'>): Promise<CostItem> {
    const costItem: CostItem = {
      ...cost,
      id: uuidv4(),
      timestamp: new Date(),
    };
    
    this.costs.set(costItem.id, costItem);
    this.runningProfit -= costItem.amount;
    
    const today = this.getDateKey(new Date());
    const current = this.dailyCosts.get(today) || 0;
    this.dailyCosts.set(today, current + costItem.amount);
    
    this.emit('cost:added', costItem);
    this.checkRiskLimits();
    
    return costItem;
  }

  private checkRiskLimits(): void {
    const today = this.getDateKey(new Date());
    const todayRevenue = this.dailyRevenue.get(today) || 0;
    const todayCosts = this.dailyCosts.get(today) || 0;
    const dailyProfit = todayRevenue - todayCosts;
    
    if (dailyProfit < -this.config.riskLimits.maxDailyLoss) {
      this.emit('risk:max_daily_loss', { dailyProfit, limit: this.config.riskLimits.maxDailyLoss });
    }
    
    if (dailyProfit < -this.config.riskLimits.emergencyStopLoss) {
      this.emit('risk:emergency_stop', { dailyProfit });
      this.emit('system:pause', { reason: 'emergency_stop_loss' });
    }
  }

  calculateProfit(period: 'daily' | 'weekly' | 'monthly'): ProfitReport {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
    
    const periodRevenues = Array.from(this.revenues.values())
      .filter(r => new Date(r.timestamp) >= startDate);
    
    const periodCosts = Array.from(this.costs.values())
      .filter(c => new Date(c.timestamp) >= startDate);
    
    const revenue = periodRevenues.reduce((sum, r) => sum + r.amount, 0);
    const costs = periodCosts.reduce((sum, c) => sum + c.amount, 0);
    const profit = revenue - costs;
    const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
    
    const bySource: Record<string, number> = {};
    for (const r of periodRevenues) {
      bySource[r.type] = (bySource[r.type] || 0) + r.amount;
    }
    
    const byAgent: Record<string, number> = {};
    for (const r of periodRevenues) {
      const agentId = r.metadata?.agentId as string || 'unknown';
      byAgent[agentId] = (byAgent[agentId] || 0) + r.amount;
    }
    
    return {
      id: uuidv4(),
      period,
      startDate,
      endDate: now,
      revenue,
      costs,
      profit,
      profitMargin,
      transactions: periodRevenues,
      breakdown: { bySource, byAgent },
    };
  }

  async processSettlement(agentId: string, amount: number): Promise<Settlement> {
    if (amount < this.config.minPayoutThreshold) {
      throw new Error(`Amount ${amount} is below minimum threshold ${this.config.minPayoutThreshold}`);
    }
    
    const settlement: Settlement = {
      id: uuidv4(),
      agentId,
      amount,
      status: 'pending',
      createdAt: new Date(),
      method: 'bank_transfer',
    };
    
    this.settlements.set(settlement.id, settlement);
    
    if (this.config.autoPayout) {
      await this.executePayout(settlement);
    }
    
    return settlement;
  }

  private async executePayout(settlement: Settlement): Promise<void> {
    settlement.status = 'processing';
    this.emit('settlement:processing', settlement);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    settlement.status = 'completed';
    settlement.processedAt = new Date();
    this.emit('settlement:completed', settlement);
  }

  getSettlements(agentId?: string): Settlement[] {
    const all = Array.from(this.settlements.values());
    if (agentId) {
      return all.filter(s => s.agentId === agentId);
    }
    return all;
  }

  getRunningProfit(): number {
    return this.runningProfit;
  }

  getDailyStats(): { revenue: number; costs: number; profit: number } {
    const today = this.getDateKey(new Date());
    const revenue = this.dailyRevenue.get(today) || 0;
    const costs = this.dailyCosts.get(today) || 0;
    return { revenue, costs, profit: revenue - costs };
  }

  getConfig(): ProfitConfig {
    return this.config;
  }

  updateConfig(updates: Partial<ProfitConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('config:updated', this.config);
  }

  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  getRevenueByAgent(agentId: string): number {
    return Array.from(this.revenues.values())
      .filter(r => r.metadata?.agentId === agentId)
      .reduce((sum, r) => sum + r.amount, 0);
  }

  getAllTimeRevenue(): number {
    return Array.from(this.revenues.values())
      .reduce((sum, r) => sum + r.amount, 0);
  }

  getAllTimeCosts(): number {
    return Array.from(this.costs.values())
      .reduce((sum, c) => sum + c.amount, 0);
  }

  pause(): void {
    this.emit('system:paused');
  }

  resume(): void {
    this.emit('system:resumed');
  }
}
