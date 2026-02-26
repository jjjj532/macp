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

export class OpenClawIntegration {
  private client: AxiosInstance;

  constructor(config: OpenClawConfig) {
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
    tools?: OpenClawTool[]
  ): Promise<{
    content: string;
    toolCalls?: any[];
  }> {
    const request: ChatRequest = {
      model: 'openclaw:main',
      messages: [{ role: 'user', content }],
      ...(tools && { tools }),
    };
    
    const response = await this.client.post<ChatResponse>(
      '/v1/chat/completions', 
      request
    );
    
    const message = response.data.choices[0]?.message;
    return {
      content: message?.content || '',
      toolCalls: message?.tool_calls,
    };
  }

  async invokeTool(toolName: string, args: any): Promise<any> {
    const response = await this.client.post('/tools/invoke', {
      tool: toolName,
      args,
    });
    return response.data;
  }

  async listSessions(): Promise<any[]> {
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

  async checkHealth(): Promise<boolean> {
    try {
      await this.listSessions();
      return true;
    } catch {
      return false;
    }
  }
}
