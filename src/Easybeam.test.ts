import {
  Easybeam,
  EasyBeamConfig,
  PortalResponse,
  ChatMessage,
  FilledVariables,
} from "./Easybeam";

describe("Easybeam Class Tests", () => {
  let easybeam: Easybeam;
  const token = "test-token";
  const config: EasyBeamConfig = { token };
  const portalId = "test-portal-id";
  const workflowId = "test-workflow-id";
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

  describe("getPortal", () => {
    it("should make a POST request and return PortalResponse", async () => {
      const mockResponse: PortalResponse = {
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

      const response = await easybeam.getPortal(
        portalId,
        userId,
        filledVariables,
        messages
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/portal/${portalId}`),
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
        easybeam.getPortal(portalId, userId, filledVariables, messages)
      ).rejects.toThrow(
        `Failed to process POST request to https://api.easybeam.ai/v1/portal/${portalId}`
      );
    });
  });

  describe("streamPortal", () => {
    it("should initiate a streaming connection and handle messages", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      const mockResponse = {
        newMessage: {
          content: "Test response",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-2",
        },
        chatId: "chat-id-1",
      };

      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(JSON.stringify(mockResponse)),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      await easybeam.streamPortal(
        portalId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      expect(global.fetch).toHaveBeenCalledWith(
        `${easybeam["baseUrl"]}/portal/${portalId}`,
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

    it("should handle errors during streaming", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error("Network error")
      );

      await easybeam.streamPortal(
        portalId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("getWorkflow", () => {
    it("should make a POST request and return PortalResponse", async () => {
      const mockResponse: PortalResponse = {
        newMessage: {
          content: "Workflow response",
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

      const response = await easybeam.getWorkflow(
        workflowId,
        userId,
        filledVariables,
        messages
      );

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/workflow/${workflowId}`),
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
        easybeam.getWorkflow(workflowId, userId, filledVariables, messages)
      ).rejects.toThrow(
        `Failed to process POST request to https://api.easybeam.ai/v1/workflow/${workflowId}`
      );
    });
  });

  describe("streamWorkflow", () => {
    it("should initiate a streaming connection and handle messages", async () => {
      const onNewResponse = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      const mockResponse = {
        newMessage: {
          content: "Workflow stream response",
          role: "AI",
          createdAt: new Date().toISOString(),
          id: "message-id-4",
        },
        chatId: "chat-id-3",
      };

      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              value: new TextEncoder().encode(JSON.stringify(mockResponse)),
              done: false,
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        body: mockReadableStream,
      });

      await easybeam.streamWorkflow(
        workflowId,
        userId,
        filledVariables,
        messages,
        onNewResponse,
        onClose,
        onError
      );

      expect(global.fetch).toHaveBeenCalledWith(
        `${easybeam["baseUrl"]}/workflow/${workflowId}`,
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
