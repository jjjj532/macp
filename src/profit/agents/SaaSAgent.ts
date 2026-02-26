import { Task } from '../../core/types';
import { v4 as uuidv4 } from 'uuid';

export interface APIPlan {
  id: string;
  name: string;
  price: number;
  callsIncluded: number;
  overagePrice: number;
  features: string[];
}

export interface APIKey {
  id: string;
  key: string;
  planId: string;
  userId: string;
  callsUsed: number;
  callsLimit: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface APIUsage {
  id: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
}

export interface APIRequest {
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface APIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  usage: {
    callsRemaining: number;
    rateLimitRemaining: number;
  };
}

export interface SaaSConfig {
  plans: APIPlan[];
  defaultPlanId: string;
  rateLimit: number;
  rateLimitWindow: number;
}

export class SaaSAgent {
  private config: SaaSConfig;
  private apiKeys: Map<string, APIKey> = new Map();
  private usage: Map<string, APIUsage[]> = new Map();
  private subscriptions: Map<string, { planId: string; startDate: Date; renewDate: Date }> = new Map();
  private monthlyRevenue: number = 0;

  constructor(config: Partial<SaaSConfig> = {}) {
    this.config = {
      plans: config.plans || [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          callsIncluded: 1000,
          overagePrice: 0.001,
          features: ['基础API访问', '社区支持'],
        },
        {
          id: 'pro',
          name: 'Pro',
          price: 29,
          callsIncluded: 100000,
          overagePrice: 0.0005,
          features: ['完整API访问', '优先支持', '高级分析'],
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 299,
          callsIncluded: 10000000,
          overagePrice: 0.0001,
          features: ['无限API访问', '专属客服', '定制开发', 'SLA保障'],
        },
      ],
      defaultPlanId: config.defaultPlanId || 'free',
      rateLimit: config.rateLimit || 100,
      rateLimitWindow: config.rateLimitWindow || 60000,
    };
  }

  async createAPIKey(userId: string, planId?: string): Promise<APIKey> {
    const plan = this.config.plans.find(p => p.id === (planId || this.config.defaultPlanId));
    if (!plan) throw new Error('Plan not found');

    const apiKey: APIKey = {
      id: uuidv4(),
      key: `sk_${this.generateKey()}`,
      planId: plan.id,
      userId,
      callsUsed: 0,
      callsLimit: plan.callsIncluded,
      createdAt: new Date(),
    };

    this.apiKeys.set(apiKey.key, apiKey);
    this.subscriptions.set(userId, {
      planId: plan.id,
      startDate: new Date(),
      renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return apiKey;
  }

  private generateKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async processRequest(apiKey: string, request: APIRequest): Promise<APIResponse> {
    const key = this.apiKeys.get(apiKey);
    if (!key) {
      return { success: false, error: 'Invalid API key' };
    }

    if (key.expiresAt && new Date() > key.expiresAt) {
      return { success: false, error: 'API key expired' };
    }

    if (key.callsUsed >= key.callsLimit) {
      return { success: false, error: 'Rate limit exceeded' };
    }

    key.callsUsed++;
    this.apiKeys.set(apiKey, key);

    const usage: APIUsage = {
      id: uuidv4(),
      apiKeyId: key.id,
      endpoint: request.endpoint,
      method: request.method,
      statusCode: 200,
      responseTime: Math.random() * 500 + 50,
      timestamp: new Date(),
    };

    const keyUsage = this.usage.get(key.id) || [];
    keyUsage.push(usage);
    this.usage.set(key.id, keyUsage);

    const plan = this.config.plans.find(p => p.id === key.planId);
    const overageCalls = Math.max(0, key.callsUsed - plan!.callsIncluded);
    const overageCharge = overageCalls * plan!.overagePrice;

    if (plan!.price > 0 && overageCharge > 0) {
      this.monthlyRevenue += overageCharge;
    }

    return {
      success: true,
      data: {
        message: 'API request processed successfully',
        endpoint: request.endpoint,
        result: this.mockAPIResponse(request.endpoint),
      },
      usage: {
        callsRemaining: key.callsLimit - key.callsUsed,
        rateLimitRemaining: this.config.rateLimit - 1,
      },
    };
  }

  private mockAPIResponse(endpoint: string): unknown {
    const responses: Record<string, unknown> = {
      '/ai/chat': { response: '这是AI生成的回复' },
      '/ai/analyze': { analysis: '这是分析结果' },
      '/ai/generate': { content: '生成内容...' },
      '/data/query': { data: ['item1', 'item2', 'item3'] },
      '/data/stats': { total: 1000, avg: 50 },
    };

    for (const [path, response] of Object.entries(responses)) {
      if (endpoint.includes(path)) return response;
    }

    return { status: 'ok' };
  }

  async revokeAPIKey(apiKey: string): Promise<boolean> {
    return this.apiKeys.delete(apiKey);
  }

  async upgradePlan(userId: string, planId: string): Promise<APIKey | null> {
    const oldSub = this.subscriptions.get(userId);
    if (!oldSub) return null;

    const newPlan = this.config.plans.find(p => p.id === planId);
    if (!newPlan) throw new Error('Plan not found');

    let userKey: APIKey | undefined;
    for (const key of this.apiKeys.values()) {
      if (key.userId === userId) {
        userKey = key;
        break;
      }
    }

    if (userKey) {
      userKey.planId = planId;
      userKey.callsLimit = newPlan.callsIncluded;
      this.apiKeys.set(userKey.key, userKey);
    }

    this.subscriptions.set(userId, {
      planId,
      startDate: new Date(),
      renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    this.monthlyRevenue += newPlan.price;

    return userKey || null;
  }

  getUsageStats(apiKeyId: string): {
    totalCalls: number;
    avgResponseTime: number;
    successRate: number;
    periodRevenue: number;
  } {
    const keyUsage = this.usage.get(apiKeyId) || [];
    const key = Array.from(this.apiKeys.values()).find(k => k.id === apiKeyId);
    const plan = key ? this.config.plans.find(p => p.id === key.planId) : null;

    const totalCalls = keyUsage.length;
    const avgResponseTime = total 
      ? keyCalls > 0Usage.reduce((sum, u) => sum + u.responseTime, 0) / totalCalls 
      : 0;
    const successCalls = keyUsage.filter(u => u.statusCode === 200).length;
    const successRate = totalCalls > 0 ? (successCalls / totalCalls) * 100 : 0;

    const overageCalls = Math.max(0, totalCalls - (plan?.callsIncluded || 0));
    const periodRevenue = plan ? (plan.price + overageCalls * (plan.overagePrice || 0)) : 0;

    return { totalCalls, avgResponseTime, successRate, periodRevenue };
  }

  getPlans(): APIPlan[] {
    return this.config.plans;
  }

  getUserAPIKeys(userId: string): APIKey[] {
    return Array.from(this.apiKeys.values()).filter(k => k.userId === userId);
  }

  getMonthlyRevenue(): number {
    return this.monthlyRevenue;
  }

  getTotalUsers(): number {
    return this.subscriptions.size;
  }

  getConfig(): SaaSConfig {
    return this.config;
  }
}
