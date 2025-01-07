import {
  Easybeam,
  EasyBeamConfig,
  ChatResponse,
  ChatMessage,
  FilledVariables,
} from "./Easybeam";

describe("Easybeam Class Tests", () => {
  let easybeam: Easybeam;
  const token = "test-token";
  const config: EasyBeamConfig = { token };
  const promptId = "test-prompt-id";
  const agentId = "test-agent-id";
  const userId = "test-user-id";
  const filledVariables: FilledVariables = { key: "value" };
  const messages: ChatMessage[] = [
    {
      content: "Hello",
      role: "USER",
      createdAt: new Date().toISOString(),
      id: "message-id-1",
    },
  ];

  beforeEach(() => {
    easybeam = new Easybeam(config);
    global.fetch = jest.fn();
    global.AbortController = jest.fn().mockImplementation(() => ({
      signal: {},
      abort: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getPrompt", () => {
    it("should make a POST request and return PromptResponse", async () => {
      const mockResponse: ChatResponse = {
        newMessage: {
          content: "AI Response",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-2",
        },
        chatId: "chat-id-1",
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const response = await easybeam.getPrompt(
        promptId,
        userId,
        filledVariables,
        messages
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/prompt/${promptId}`),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          }),
          body: JSON.stringify({
            variables: filledVariables,
            messages,
            stream: "false",
            userId,
          }),
        })
      );

      expect(response).toEqual(mockResponse);
    });

    it("should throw an error when the response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValueOnce({ error: "Bad Request" }),
      });

      await expect(
        easybeam.getPrompt(promptId, userId, filledVariables, messages)
      ).rejects.toThrow(
        `Failed to process POST request to https://api.easybeam.ai/v1/prompt/${promptId}`
      );
    });
  });

  describe("streamPrompt", () => {
    it("should initiate a streaming connection and handle SSE messages", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      const mockResponse: ChatResponse = {
        newMessage: {
          content: "Test response",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-2",
        },
        chatId: "chat-id-1",
      };

      const mockSSEResponse = `data: ${JSON.stringify(mockResponse)}\n\n`;

      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(mockSSEResponse),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      await easybeam.streamPrompt(
        promptId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      expect(global.fetch).toHaveBeenCalledWith(
        `${easybeam["baseUrl"]}/prompt/${promptId}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          }),
          body: JSON.stringify({
            variables: filledVariables,
            messages,
            stream: "true",
            userId,
          }),
        })
      );

      // Wait for the stream processing to complete
      await new Promise(process.nextTick);

      expect(onNewResponse).toHaveBeenCalledWith(mockResponse);
      expect(onClose).toHaveBeenCalled();
    });

    it("should handle multiple SSE messages in a single chunk", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      const mockResponse1: ChatResponse = {
        newMessage: {
          content: "Test response 1",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-2",
        },
        chatId: "chat-id-1",
      };

      const mockResponse2: ChatResponse = {
        newMessage: {
          content: "Test response 2",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-3",
        },
        chatId: "chat-id-1",
        streamFinished: true,
      };

      const mockSSEResponse = `data: ${JSON.stringify(
        mockResponse1
      )}\n\ndata: ${JSON.stringify(mockResponse2)}\n\n`;

      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(mockSSEResponse),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      await easybeam.streamPrompt(
        promptId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      // Wait for the stream processing to complete
      await new Promise(process.nextTick);

      expect(onNewResponse).toHaveBeenCalledTimes(2);
      expect(onNewResponse).toHaveBeenNthCalledWith(1, mockResponse1);
      expect(onNewResponse).toHaveBeenNthCalledWith(2, mockResponse2);
      expect(onClose).toHaveBeenCalled();
    });

    it("should handle errors during streaming", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      const mockErrorResponse = `data: {"error": "Test error", "status": 400}\n\n`;

      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(mockErrorResponse),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      await easybeam.streamPrompt(
        promptId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      // Wait for the stream processing to complete
      await new Promise(process.nextTick);

      expect(onError).toHaveBeenCalledWith(
        new Error("Stream error: Test error status: 400")
      );
    });
  });

  describe("getAgent", () => {
    it("should make a POST request and return AgentResponse", async () => {
      const mockResponse: ChatResponse = {
        newMessage: {
          content: "Agent response",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-3",
        },
        chatId: "chat-id-2",
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const response = await easybeam.getAgent(
        agentId,
        userId,
        filledVariables,
        messages
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/agent/${agentId}`),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          }),
          body: JSON.stringify({
            variables: filledVariables,
            messages,
            stream: "false",
            userId,
          }),
        })
      );

      expect(response).toEqual(mockResponse);
    });

    it("should throw an error when the response is not ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValueOnce({ error: "Bad Request" }),
      });

      await expect(
        easybeam.getAgent(agentId, userId, filledVariables, messages)
      ).rejects.toThrow(
        `Failed to process POST request to https://api.easybeam.ai/v1/agent/${agentId}`
      );
    });
  });

  describe("streamAgent", () => {
    it("should initiate a streaming connection and handle SSE messages", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      const mockResponse: ChatResponse = {
        newMessage: {
          content: "Agent stream response",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-4",
        },
        chatId: "chat-id-3",
      };

      const mockSSEResponse = `data: ${JSON.stringify(mockResponse)}\n\n`;

      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(mockSSEResponse),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      await easybeam.streamAgent(
        agentId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      expect(global.fetch).toHaveBeenCalledWith(
        `${easybeam["baseUrl"]}/agent/${agentId}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          }),
          body: JSON.stringify({
            variables: filledVariables,
            messages,
            stream: "true",
            userId,
          }),
        })
      );

      // Wait for the stream processing to complete
      await new Promise(process.nextTick);

      expect(onNewResponse).toHaveBeenCalledWith(mockResponse);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("review", () => {
    it("should send a POST request for review", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await easybeam.review("chat-id-1", userId, 5, "Great service");

      expect(global.fetch).toHaveBeenCalledWith(
        `${easybeam["baseUrl"]}/review`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          }),
          body: JSON.stringify({
            chatId: "chat-id-1",
            userId,
            reviewScore: 5,
            reviewText: "Great service",
          }),
        })
      );
    });

    it("should throw an error if the review request fails", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      await expect(
        easybeam.review("chat-id-1", userId, 5, "Great service")
      ).rejects.toThrow(
        `Failed to process POST request to ${easybeam["baseUrl"]}/review`
      );
    });
  });

  describe("cancelCurrentStream", () => {
    it("should abort the current stream if AbortController is defined", () => {
      const mockAbortController = {
        abort: jest.fn(),
      };
      easybeam["currentAbortController"] = mockAbortController as any;

      easybeam.cancelCurrentStream();

      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(easybeam["currentAbortController"]).toBeUndefined();
    });

    it("should do nothing if currentAbortController is undefined", () => {
      easybeam["currentAbortController"] = undefined;

      easybeam.cancelCurrentStream();

      expect(easybeam["currentAbortController"]).toBeUndefined();
    });
  });
});
