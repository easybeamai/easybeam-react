export type NetworkMethod = "PUT" | "POST" | "DELETE" | "GET";

export interface EasyBeamConfig {
  token: string;
}

export interface FilledVariables {
  [key: string]: string;
}

export interface UserSecrets {
  [key: string]: string;
}

export interface ChatMessage {
  content: string;
  role: ChatRole;
  createdAt: string;
  providerId?: string;
  id: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type ChatRole = "AI" | "USER";

export interface ChatResponse {
  newMessage: ChatMessage;
  chatId: string;
  streamFinished?: boolean;
}

export interface EasybeamService {
  streamPrompt(
    promptId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    onNewResponse: (newMessage: ChatResponse) => void,
    onClose?: () => void,
    onError?: (error: Error) => void
  ): Promise<void>;

  getPrompt(
    promptId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[]
  ): Promise<ChatResponse>;

  streamAgent(
    agentId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    onNewResponse: (newMessage: ChatResponse) => void,
    onClose?: () => void,
    onError?: (error: Error) => void,
    userSecrets?: UserSecrets
  ): Promise<void>;

  getAgent(
    agentId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    userSecrets?: UserSecrets
  ): Promise<ChatResponse>;

  review(
    chatId: string,
    userId: string | undefined,
    reviewScore: number | undefined,
    reviewText: string | undefined
  ): Promise<void>;
}

export class Easybeam implements EasybeamService {
  private config: EasyBeamConfig;
  private readonly baseUrl = "https://api.easybeam.ai/v1";
  private currentAbortController?: AbortController;

  constructor(config: EasyBeamConfig) {
    this.config = config;
  }

  private async sendRequest(
    url: string,
    method: NetworkMethod,
    body?: any
  ): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.token}`,
    };

    const response = await fetch(url, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Failed to process ${method} request to ${url}`);
    }

    return response;
  }

  private async sendStream(
    url: string,
    method: NetworkMethod,
    body: any,
    onMessage: (message: ChatResponse) => void,
    onClose?: () => void,
    onError?: (error: any) => void
  ): Promise<void> {
    const controller = new AbortController();
    const { signal } = controller;

    this.currentAbortController = controller;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      if (!response.body) {
        throw new Error("Failed to get readable stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleMessage = (chunk: string) => {
        buffer += chunk;
        try {
          while (buffer.includes("\n\n")) {
            const end = buffer.indexOf("\n\n");
            const message = buffer.substring(0, end);
            buffer = buffer.substring(end + 2);

            if (message.startsWith("data: ")) {
              const dataJson = message.slice(6);
              const data = JSON.parse(dataJson);
              if (data.error) {
                throw new Error(
                  `Stream error: ${data.error} status: ${data.status ?? 0}`
                );
              }
              const chatResponse = data as ChatResponse;
              onMessage(chatResponse);
              if (chatResponse.streamFinished) {
                this.cancelStream();
              }
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            onError?.(error);
          } else {
            onError?.(new Error("Unknown json processing error"));
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          onClose?.();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        handleMessage(chunk);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        onClose?.();
      } else {
        onError?.(error);
      }
    }
  }

  private cancelStream() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
    }
  }

  private async streamEndpoint(
    endpoint: string,
    id: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    onNewResponse: (newMessage: ChatResponse) => void,
    onClose?: () => void,
    onError?: (error: Error) => void,
    userSecrets?: UserSecrets
  ): Promise<void> {
    const params = {
      variables: filledVariables,
      messages,
      stream: "true",
      userId,
      userSecrets,
    };

    const url = `${this.baseUrl}/${endpoint}/${id}`;

    await this.sendStream(url, "POST", params, onNewResponse, onClose, onError);
  }

  private async getEndpoint(
    endpoint: string,
    id: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    userSecrets?: UserSecrets
  ): Promise<ChatResponse> {
    const params = {
      variables: filledVariables,
      messages,
      stream: "false",
      userId,
      userSecrets,
    };

    const url = `${this.baseUrl}/${endpoint}/${id}`;

    const response = await this.sendRequest(url, "POST", params);
    const data = await response.json();
    return data as ChatResponse;
  }

  async streamPrompt(
    promptId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    onNewResponse: (newMessage: ChatResponse) => void,
    onClose: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    await this.streamEndpoint(
      "prompt",
      promptId,
      userId,
      filledVariables,
      messages,
      onNewResponse,
      onClose,
      onError
    );
  }

  async getPrompt(
    promptId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[]
  ): Promise<ChatResponse> {
    return await this.getEndpoint(
      "prompt",
      promptId,
      userId,
      filledVariables,
      messages
    );
  }

  async streamAgent(
    agentId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    onNewResponse: (newMessage: ChatResponse) => void,
    onClose: () => void,
    onError: (error: Error) => void,
    userSecrets?: UserSecrets
  ): Promise<void> {
    await this.streamEndpoint(
      "agent",
      agentId,
      userId,
      filledVariables,
      messages,
      onNewResponse,
      onClose,
      onError,
      userSecrets
    );
  }

  async getAgent(
    agentId: string,
    userId: string | undefined,
    filledVariables: FilledVariables,
    messages: ChatMessage[],
    userSecrets?: UserSecrets
  ): Promise<ChatResponse> {
    return await this.getEndpoint(
      "agent",
      agentId,
      userId,
      filledVariables,
      messages,
      userSecrets
    );
  }

  async review(
    chatId: string,
    userId: string | undefined,
    reviewScore: number | undefined,
    reviewText: string | undefined
  ): Promise<void> {
    const url = `${this.baseUrl}/review`;
    await this.sendRequest(url, "POST", {
      chatId,
      userId,
      reviewScore,
      reviewText,
    });
  }

  cancelCurrentStream() {
    this.cancelStream();
  }
}
