import { Message, MessageType } from '../../core/types';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

export interface MessageHandler {
  (message: Message): Promise<void> | void;
}

export interface Subscription {
  agentId: string;
  topics: Set<string>;
  handler: MessageHandler;
}

export interface MessageFilter {
  senderId?: string;
  receiverId?: string;
  topic?: string;
  type?: MessageType;
  since?: Date;
}

export class MessageBus extends EventEmitter {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private topicSubscribers: Map<string, Set<string>> = new Map();
  private pendingResponses: Map<string, { resolve: (value: Message) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private messageStore: Map<string, Message> = new Map();
  private redis: Redis | null = null;
  private redisChannel = 'macp:messages';
  private maxStoredMessages: number = 10000;

  constructor(redisUrl?: string) {
    super();
    if (redisUrl) {
      this.initRedis(redisUrl);
    }
  }

  private async initRedis(url: string): Promise<void> {
    try {
      this.redis = new Redis(url);
      this.redis.subscribe(this.redisChannel);
      this.redis.on('message', (channel, message) => {
        if (channel === this.redisChannel) {
          const msg = JSON.parse(message) as Message;
          this.handleIncomingMessage(msg);
        }
      });
      this.emit('redis:connected');
    } catch (error) {
      this.emit('redis:error', error);
    }
  }

  isRedisConnected(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  async publish(message: Omit<Message, 'id' | 'timestamp'>): Promise<Message> {
    const fullMessage: Message = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
    };

    if (fullMessage.persistent) {
      this.storeMessage(fullMessage);
    }

    if (this.redis) {
      try {
        await this.redis.publish(this.redisChannel, JSON.stringify(fullMessage));
      } catch (error) {
        this.emit('redis:publishError', error);
      }
    }

    this.handleOutgoingMessage(fullMessage);
    return fullMessage;
  }

  private storeMessage(message: Message): void {
    this.messageStore.set(message.id, message);
    
    if (this.messageStore.size > this.maxStoredMessages) {
      const oldestKey = this.messageStore.keys().next().value;
      if (oldestKey) {
        this.messageStore.delete(oldestKey);
      }
    }
  }

  async send(senderId: string, receiverId: string, payload: Record<string, unknown>, persistent: boolean = false): Promise<Message> {
    return this.publish({
      type: 'request',
      senderId,
      receiverId,
      payload,
      persistent,
    });
  }

  async broadcast(senderId: string, topic: string, payload: Record<string, unknown>): Promise<Message> {
    return this.publish({
      type: 'broadcast',
      senderId,
      topic,
      payload,
      persistent: false,
    });
  }

  async broadcastPersistent(senderId: string, topic: string, payload: Record<string, unknown>): Promise<Message> {
    return this.publish({
      type: 'broadcast',
      senderId,
      topic,
      payload,
      persistent: true,
    });
  }

  async requestResponse(senderId: string, receiverId: string, payload: Record<string, unknown>, timeoutMs: number = 30000): Promise<Message> {
    const correlationId = uuidv4();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingResponses.set(correlationId, { resolve, reject, timeout });

      this.publish({
        type: 'request',
        senderId,
        receiverId,
        payload,
        correlationId,
        persistent: false,
      });
    });
  }

  subscribe(agentId: string, topics: string[], handler: MessageHandler): void {
    if (!this.subscriptions.has(agentId)) {
      this.subscriptions.set(agentId, []);
    }

    const sub: Subscription = { agentId, topics: new Set(topics), handler };
    this.subscriptions.get(agentId)!.push(sub);

    for (const topic of topics) {
      if (!this.topicSubscribers.has(topic)) {
        this.topicSubscribers.set(topic, new Set());
      }
      this.topicSubscribers.get(topic)!.add(agentId);
    }
  }

  unsubscribe(agentId: string, topics?: string[]): void {
    if (!topics) {
      this.subscriptions.delete(agentId);
      for (const subscribers of this.topicSubscribers.values()) {
        subscribers.delete(agentId);
      }
      return;
    }

    const agentSubs = this.subscriptions.get(agentId);
    if (!agentSubs) return;

    for (const topic of topics) {
      this.topicSubscribers.get(topic)?.delete(agentId);
    }
    
    this.subscriptions.set(agentId, agentSubs.filter(sub => 
      ![...topics].some(t => sub.topics.has(t))
    ));
  }

  getSubscribers(topic: string): string[] {
    return Array.from(this.topicSubscribers.get(topic) || []);
  }

  private handleOutgoingMessage(message: Message): void {
    this.emit('message:sent', message);

    if (message.receiverId) {
      const receiverSubs = this.subscriptions.get(message.receiverId);
      if (receiverSubs) {
        for (const sub of receiverSubs) {
          if (sub.topics.has('*') || (message.topic && sub.topics.has(message.topic))) {
            sub.handler(message);
          }
        }
      }
    }

    if (message.topic) {
      const topicSubs = this.topicSubscribers.get(message.topic);
      if (topicSubs) {
        for (const agentId of topicSubs) {
          const subs = this.subscriptions.get(agentId);
          if (subs) {
            for (const sub of subs) {
              if (sub.topics.has(message.topic!)) {
                sub.handler(message);
              }
            }
          }
        }
      }
    }
  }

  private handleIncomingMessage(message: Message): void {
    if (message.correlationId) {
      const pending = this.pendingResponses.get(message.correlationId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingResponses.delete(message.correlationId);
        pending.resolve(message);
        return;
      }
    }

    this.handleOutgoingMessage(message);
  }

  getMessages(filter?: MessageFilter, limit: number = 100): Message[] {
    let messages = Array.from(this.messageStore.values());
    
    if (filter) {
      if (filter.senderId) {
        messages = messages.filter(m => m.senderId === filter.senderId);
      }
      if (filter.receiverId) {
        messages = messages.filter(m => m.receiverId === filter.receiverId);
      }
      if (filter.topic) {
        messages = messages.filter(m => m.topic === filter.topic);
      }
      if (filter.type) {
        messages = messages.filter(m => m.type === filter.type);
      }
      if (filter.since) {
        messages = messages.filter(m => new Date(m.timestamp) >= filter.since!);
      }
    }
    
    return messages.slice(-limit);
  }

  getMessagesByCorrelation(correlationId: string): Message[] {
    return Array.from(this.messageStore.values()).filter(m => m.correlationId === correlationId);
  }

  clearHistory(): void {
    this.messageStore.clear();
  }

  clearHistoryBefore(date: Date): void {
    for (const [id, msg] of this.messageStore.entries()) {
      if (new Date(msg.timestamp) < date) {
        this.messageStore.delete(id);
      }
    }
  }

  getStats(): {
    totalMessages: number;
    subscriptions: number;
    topics: number;
    redisConnected: boolean;
  } {
    return {
      totalMessages: this.messageStore.size,
      subscriptions: this.subscriptions.size,
      topics: this.topicSubscribers.size,
      redisConnected: this.isRedisConnected(),
    };
  }
}
