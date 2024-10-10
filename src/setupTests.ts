import "whatwg-fetch";
import { TextDecoder, TextEncoder } from "util";
import { ReadableStream } from "stream/web";

// @ts-ignore
global.TextEncoder = TextEncoder;
// @ts-ignore
global.TextDecoder = TextDecoder;
(global as any).ReadableStream = ReadableStream;

// Polyfill for ReadableStream if not available
if (typeof ReadableStream === "undefined") {
  (global as any).ReadableStream = class MockReadableStream {
    constructor(public source: any) {}
    getReader() {
      let done = false;
      return {
        read: async () => {
          if (done) {
            return { done: true, value: undefined };
          }
          done = true;
          return { done: false, value: new Uint8Array(this.source) };
        },
        releaseLock: () => {},
      };
    }
  };
}
