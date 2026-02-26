import { Metric, LogEntry } from '../../core/types';
import { EventEmitter } from 'events';
import winston from 'winston';

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, Metric[]> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private retentionMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(retentionMs: number = 3600000) {
    super();
    this.retentionMs = retentionMs;
    this.startCleanup();
  }

  incrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
    this.record(name, this.counters.get(key)!, labels);
  }

  decrementCounter(name: string, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, Math.max(0, current - 1));
    this.record(name, this.counters.get(key)!, labels);
  }

  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    this.gauges.set(key, value);
    this.record(name, value, labels);
  }

  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.makeKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);
    this.record(name, value, labels);
  }

  private record(name: string, value: number, labels: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      labels,
      timestamp: new Date(),
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);
  }

  getCounter(name: string, labels: Record<string, string> = {}): number {
    return this.counters.get(this.makeKey(name, labels)) || 0;
  }

  getGauge(name: string, labels: Record<string, string> = {}): number {
    return this.gauges.get(this.makeKey(name, labels)) || 0;
  }

  getHistogramStats(name: string, labels: Record<string, string> = {}): { min: number; max: number; avg: number; p50: number; p95: number; p99: number } | null {
    const values = this.histograms.get(this.makeKey(name, labels));
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  getAllMetrics(name?: string): Metric[] {
    if (name) {
      return this.metrics.get(name) || [];
    }
    return Array.from(this.metrics.values()).flat();
  }

  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  private makeKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    return `${name}${labelStr ? '{' + labelStr + '}' : ''}`;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.retentionMs;
      for (const [name, metrics] of this.metrics.entries()) {
        const filtered = metrics.filter(m => m.timestamp.getTime() > cutoff);
        if (filtered.length === 0) {
          this.metrics.delete(name);
        } else {
          this.metrics.set(name, filtered);
        }
      }
    }, 60000);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.metrics.clear();
  }
}

export class LogAggregator extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogs: number = 10000;
  private logger: winston.Logger;
  private searchIndex: Map<string, Set<number>> = new Map();

  constructor() {
    super();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
      ],
    });
  }

  log(level: LogEntry['level'], message: string, metadata?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      metadata,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      const removed = this.logs.shift();
      if (removed) {
        this.removeFromIndex(removed);
      }
    }

    this.indexEntry(entry);
    this.logger.log(level, message, metadata);
    this.emit('log', entry);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  private indexEntry(entry: LogEntry): void {
    const index = this.logs.length - 1;
    
    if (entry.agentId) {
      if (!this.searchIndex.has(entry.agentId)) {
        this.searchIndex.set(entry.agentId, new Set());
      }
      this.searchIndex.get(entry.agentId)!.add(index);
    }
    
    if (entry.taskId) {
      if (!this.searchIndex.has(entry.taskId)) {
        this.searchIndex.set(entry.taskId, new Set());
      }
      this.searchIndex.get(entry.taskId)!.add(index);
    }
  }

  private removeFromIndex(entry: LogEntry): void {
    if (entry.agentId) {
      this.searchIndex.get(entry.agentId)?.delete(this.logs.indexOf(entry));
    }
    if (entry.taskId) {
      this.searchIndex.get(entry.taskId)?.delete(this.logs.indexOf(entry));
    }
  }

  query(filters: {
    level?: LogEntry['level'];
    agentId?: string;
    taskId?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    searchText?: string;
  }): LogEntry[] {
    let results = [...this.logs];

    if (filters.level) {
      results = results.filter(l => l.level === filters.level);
    }
    if (filters.agentId) {
      results = results.filter(l => l.agentId === filters.agentId);
    }
    if (filters.taskId) {
      results = results.filter(l => l.taskId === filters.taskId);
    }
    if (filters.startTime) {
      results = results.filter(l => l.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      results = results.filter(l => l.timestamp <= filters.endTime!);
    }
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      results = results.filter(l => 
        l.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(l.metadata).toLowerCase().includes(searchLower)
      );
    }

    return results.slice(-(filters.limit || 100));
  }

  getRecent(limit: number = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  getLogCount(): { total: number; debug: number; info: number; warn: number; error: number } {
    return {
      total: this.logs.length,
      debug: this.logs.filter(l => l.level === 'debug').length,
      info: this.logs.filter(l => l.level === 'info').length,
      warn: this.logs.filter(l => l.level === 'warn').length,
      error: this.logs.filter(l => l.level === 'error').length,
    };
  }

  clear(): void {
    this.logs = [];
    this.searchIndex.clear();
  }
}

export interface AlertRule {
  id: string;
  name: string;
  condition: () => boolean;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  cooldownMs?: number;
}

export class AlertManager extends EventEmitter {
  private alerts: Map<string, { message: string; severity: 'info' | 'warning' | 'critical'; timestamp: Date; ruleId?: string }> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  removeRule(id: string): void {
    this.rules.delete(id);
  }

  startRuleCheck(intervalMs: number = 60000): void {
    if (this.checkInterval) return;
    
    this.checkInterval = setInterval(() => {
      this.checkRules();
    }, intervalMs);
  }

  stopRuleCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async checkRules(): Promise<void> {
    for (const [id, rule] of this.rules.entries()) {
      if (this.shouldAlert(rule)) {
        if (rule.condition()) {
          this.fireAlert(id, rule.message, rule.severity, rule.id);
        }
      }
    }
  }

  private shouldAlert(rule: AlertRule): boolean {
    const lastTime = this.lastAlertTime.get(rule.id) || 0;
    const cooldown = rule.cooldownMs || 60000;
    return Date.now() - lastTime >= cooldown;
  }

  fireAlert(id: string, message: string, severity: 'info' | 'warning' | 'critical', ruleId?: string): void {
    const alert = { message, severity, timestamp: new Date(), ruleId };
    this.alerts.set(id, alert);
    this.lastAlertTime.set(id, Date.now());
    this.emit('alert', { id, ...alert });
  }

  getAlerts(activeOnly: boolean = false): { id: string; message: string; severity: string; timestamp: Date; ruleId?: string }[] {
    if (activeOnly) {
      const cutoff = Date.now() - 300000;
      return Array.from(this.alerts.entries())
        .filter(([_, alert]) => alert.timestamp.getTime() > cutoff)
        .map(([id, alert]) => ({ id, ...alert }));
    }
    return Array.from(this.alerts.entries()).map(([id, alert]) => ({ id, ...alert }));
  }

  clearAlert(id: string): void {
    this.alerts.delete(id);
  }

  clearAllAlerts(): void {
    this.alerts.clear();
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }
}
