import { KnowledgeEntry, KnowledgeVersion } from '../../core/types';
import { v4 as uuidv4 } from 'uuid';

export interface VectorStore {
  add(entries: KnowledgeEntry[]): Promise<void>;
  search(query: number[], limit: number): Promise<KnowledgeEntry[]>;
  delete(ids: string[]): Promise<void>;
}

export interface GraphStore {
  addNode(id: string, type: string, properties: Record<string, unknown>): Promise<void>;
  addEdge(from: string, to: string, type: string, properties?: Record<string, unknown>): Promise<void>;
  query(pattern: string, params?: Record<string, unknown>): Promise<unknown[]>;
  getNeighbors(id: string, depth?: number): Promise<unknown[]>;
}

export class KnowledgeBase {
  private vectorStore: VectorStore;
  private graphStore: GraphStore;
  private memoryStore: Map<string, KnowledgeEntry[]> = new Map();
  private versionHistory: Map<string, KnowledgeVersion[]> = new Map();
  private maxVersions: number = 50;

  constructor(vectorStore: VectorStore, graphStore: GraphStore) {
    this.vectorStore = vectorStore;
    this.graphStore = graphStore;
  }

  async add(entry: Omit<KnowledgeEntry, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> {
    const fullEntry: KnowledgeEntry = {
      ...entry,
      id: uuidv4(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.vectorStore.add([fullEntry]);
    
    if (!this.memoryStore.has('default')) {
      this.memoryStore.set('default', []);
    }
    this.memoryStore.get('default')!.push(fullEntry);

    await this.graphStore.addNode(fullEntry.id, 'knowledge', {
      content: fullEntry.content,
      metadata: fullEntry.metadata,
    });

    this.initVersionHistory(fullEntry);

    return fullEntry;
  }

  private initVersionHistory(entry: KnowledgeEntry): void {
    const version: KnowledgeVersion = {
      entryId: entry.id,
      version: entry.version,
      content: entry.content,
      metadata: entry.metadata,
      createdAt: entry.createdAt,
      changeType: 'created',
    };
    this.versionHistory.set(entry.id, [version]);
  }

  async search(query: string, limit: number = 10): Promise<KnowledgeEntry[]> {
    const queryEmbedding = await this.embedText(query);
    return this.vectorStore.search(queryEmbedding, limit);
  }

  async searchById(id: string): Promise<KnowledgeEntry | undefined> {
    const all = Array.from(this.memoryStore.values()).flat();
    return all.find(e => e.id === id);
  }

  async update(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | null> {
    const entry = await this.searchById(id);
    if (!entry) return null;

    const previousVersion = this.saveVersion(entry, 'updated');

    const updated: KnowledgeEntry = {
      ...entry,
      ...updates,
      id: entry.id,
      version: entry.version + 1,
      updatedAt: new Date(),
    };

    await this.vectorStore.delete([id]);
    await this.vectorStore.add([updated]);

    const entries = this.memoryStore.get('default') || [];
    const index = entries.findIndex(e => e.id === id);
    if (index >= 0) {
      entries[index] = updated;
    }

    return updated;
  }

  private saveVersion(entry: KnowledgeEntry, changeType: 'created' | 'updated' | 'deleted'): KnowledgeVersion {
    const version: KnowledgeVersion = {
      entryId: entry.id,
      version: entry.version,
      content: entry.content,
      metadata: entry.metadata,
      createdAt: entry.updatedAt,
      changeType,
    };

    let history = this.versionHistory.get(entry.id) || [];
    history.push(version);
    
    if (history.length > this.maxVersions) {
      history = history.slice(-this.maxVersions);
    }
    this.versionHistory.set(entry.id, history);

    return version;
  }

  async getVersionHistory(entryId: string): Promise<KnowledgeVersion[]> {
    return this.versionHistory.get(entryId) || [];
  }

  async getVersion(entryId: string, version: number): Promise<KnowledgeEntry | null> {
    const history = this.versionHistory.get(entryId);
    if (!history) return null;

    const versionEntry = history.find(v => v.version === version);
    if (!versionEntry) return null;

    return {
      id: entryId,
      content: versionEntry.content,
      metadata: versionEntry.metadata,
      version: versionEntry.version,
      createdAt: history[0]?.createdAt || new Date(),
      updatedAt: versionEntry.createdAt,
    };
  }

  async rollback(entryId: string, targetVersion: number): Promise<KnowledgeEntry | null> {
    const targetEntry = await this.getVersion(entryId, targetVersion);
    if (!targetEntry) return null;

    const currentEntry = await this.searchById(entryId);
    if (currentEntry) {
      this.saveVersion(currentEntry, 'updated');
    }

    await this.vectorStore.delete([entryId]);
    await this.vectorStore.add([targetEntry]);

    const entries = this.memoryStore.get('default') || [];
    const index = entries.findIndex(e => e.id === entryId);
    if (index >= 0) {
      entries[index] = targetEntry;
    }

    this.saveVersion(targetEntry, 'updated');

    return targetEntry;
  }

  async getLatestVersions(limit: number = 10): Promise<KnowledgeVersion[]> {
    const allVersions: KnowledgeVersion[] = [];
    
    for (const versions of this.versionHistory.values()) {
      if (versions.length > 0) {
        allVersions.push(versions[versions.length - 1]);
      }
    }

    return allVersions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async compareVersions(entryId: string, version1: number, version2: number): Promise<{
    added: string[];
    removed: string[];
    modified: string[];
  }> {
    const v1 = await this.getVersion(entryId, version1);
    const v2 = await this.getVersion(entryId, version2);

    if (!v1 || !v2) {
      return { added: [], removed: [], modified: [] };
    }

    const keys1 = new Set(Object.keys(v1.metadata || {}));
    const keys2 = new Set(Object.keys(v2.metadata || {}));

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    for (const key of keys2) {
      if (!keys1.has(key)) added.push(key);
      else if (v1.metadata?.[key] !== v2.metadata?.[key]) modified.push(key);
    }

    for (const key of keys1) {
      if (!keys2.has(key)) removed.push(key);
    }

    return { added, removed, modified };
  }

  async delete(id: string): Promise<void> {
    const entry = await this.searchById(id);
    if (entry) {
      this.saveVersion(entry, 'deleted');
    }
    
    await this.vectorStore.delete([id]);
    
    const entries = this.memoryStore.get('default') || [];
    this.memoryStore.set('default', entries.filter(e => e.id !== id));
  }

  async addRelation(fromId: string, toId: string, relationType: string, properties?: Record<string, unknown>): Promise<void> {
    await this.graphStore.addEdge(fromId, toId, relationType, properties);
  }

  async getRelated(id: string, depth: number = 1): Promise<unknown[]> {
    return this.graphStore.getNeighbors(id, depth);
  }

  async syncMemory(agentId: string, entries: KnowledgeEntry[]): Promise<void> {
    this.memoryStore.set(agentId, entries);
  }

  async getSharedMemory(agentId: string): Promise<KnowledgeEntry[]> {
    const allEntries: KnowledgeEntry[] = [];
    for (const [key, entries] of this.memoryStore.entries()) {
      if (key !== agentId && entries.length > 0) {
        allEntries.push(...entries);
      }
    }
    return allEntries.slice(0, 100);
  }

  private async embedText(text: string): Promise<number[]> {
    const hash = text.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    const embedding = new Array(128).fill(0).map((_, i) => 
      Math.sin(hash + i) * Math.cos(hash - i)
    );
    
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  getAll(): KnowledgeEntry[] {
    return Array.from(this.memoryStore.values()).flat();
  }

  clearHistory(entryId?: string): void {
    if (entryId) {
      this.versionHistory.delete(entryId);
    } else {
      this.versionHistory.clear();
    }
  }
}

export class InMemoryVectorStore implements VectorStore {
  private entries: Map<string, KnowledgeEntry> = new Map();

  async add(entries: KnowledgeEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.id, entry);
    }
  }

  async search(query: number[], limit: number): Promise<KnowledgeEntry[]> {
    const results = Array.from(this.entries.values())
      .map(entry => ({
        entry,
        score: this.cosineSimilarity(query, entry.embedding || []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.entry);

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.entries.delete(id);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return magA && magB ? dotProduct / (magA * magB) : 0;
  }
}

export class InMemoryGraphStore implements GraphStore {
  private nodes: Map<string, { type: string; properties: Record<string, unknown> }> = new Map();
  private edges: Map<string, Map<string, { type: string; properties: Record<string, unknown> }>> = new Map();

  async addNode(id: string, type: string, properties: Record<string, unknown>): Promise<void> {
    this.nodes.set(id, { type, properties });
    if (!this.edges.has(id)) {
      this.edges.set(id, new Map());
    }
  }

  async addEdge(from: string, to: string, type: string, properties?: Record<string, unknown>): Promise<void> {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Map());
    }
    this.edges.get(from)!.set(to, { type, properties: properties || {} });
  }

  async query(pattern: string, params?: Record<string, unknown>): Promise<unknown[]> {
    return [];
  }

  async getNeighbors(id: string, depth: number = 1): Promise<unknown[]> {
    const neighbors: { id: string; type: string; properties: Record<string, unknown> }[] = [];
    const visited = new Set<string>();
    const queue: { id: string; currentDepth: number }[] = [{ id, currentDepth: 0 }];

    while (queue.length > 0) {
      const { id: currentId, currentDepth } = queue.shift()!;
      if (visited.has(currentId) || currentDepth > depth) continue;
      visited.add(currentId);

      const edges = this.edges.get(currentId);
      if (edges) {
        for (const [neighborId, edge] of edges) {
          neighbors.push({
            id: neighborId,
            type: edge.type,
            properties: edge.properties,
          });
          queue.push({ id: neighborId, currentDepth: currentDepth + 1 });
        }
      }
    }

    return neighbors;
  }
}
