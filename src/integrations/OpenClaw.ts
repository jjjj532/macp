import axios, { AxiosInstance } from 'axios';

export interface OpenClawMessage {
  role: string;
  content: string;
}

export interface OpenClawTool {
  type: string;
  function?: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface ChatRequest {
  model: string;
  messages: OpenClawMessage[];
  tools?: OpenClawTool[];
  tool_choice?: string;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: any[];
    };
    finish_reason: string;
  }[];
  created: number;
}

export interface OpenClawConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
}

export class OpenClawIntegration {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(config: OpenClawConfig) {
    this.baseUrl = config.baseUrl;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 300000,
      headers: { 
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
      },
    });
  }

  async sendMessage(
    content: string, 
    tools?: OpenClawTool[],
    systemMessage?: string
  ): Promise<{
    content: string;
    toolCalls?: any[];
  }> {
    const messages: OpenClawMessage[] = [];
    
    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }
    messages.push({ role: 'user', content });
    
    const request: ChatRequest = {
      model: 'openclaw:main',
      messages,
      ...(tools && { tools }),
    };
    
    try {
      const response = await this.client.post<ChatResponse>(
        '/v1/chat/completions', 
        request
      );
      
      const message = response.data.choices[0]?.message;
      return {
        content: message?.content || '',
        toolCalls: message?.tool_calls,
      };
    } catch (error: any) {
      throw new Error(`OpenClaw API error: ${error.message}`);
    }
  }

  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    try {
      const response = await this.client.post('/tools/invoke', {
        tool: toolName,
        args,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`OpenClaw tool invocation failed: ${error.message}`);
    }
  }

  async listSessions(): Promise<Session[]> {
    try {
      const response = await this.client.post('/tools/invoke', {
        tool: 'sessions_list',
        args: {},
      });
      return response.data?.result?.sessions || [];
    } catch {
      return [];
    }
  }

  async createSession(name: string): Promise<Session | null> {
    try {
      const response = await this.client.post('/tools/invoke', {
        tool: 'session_create',
        args: { name },
      });
      return response.data?.result?.session || null;
    } catch {
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      await this.client.post('/tools/invoke', {
        tool: 'session_delete',
        args: { session_id: sessionId },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    try {
      const response = await this.client.post('/tools/invoke', {
        tool: 'session_get',
        args: { session_id: sessionId },
      });
      return response.data?.result?.session || null;
    } catch {
      return null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.listSessions();
      return true;
    } catch {
      return false;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
