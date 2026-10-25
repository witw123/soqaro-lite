import {
  apiErrorResponseSchema,
  createApiErrorResponse,
  errorCodes
} from "./errors";
import { describe, expect, it } from "vitest";

describe("api error responses", () => {
  it("validates standard error response envelopes", () => {
    expect(
      apiErrorResponseSchema.parse(
        createApiErrorResponse(errorCodes.realtimeUnavailable, "Realtime sync unavailable.")
      )
    ).toEqual({
      code: "REALTIME_UNAVAILABLE",
      message: "Realtime sync unavailable."
    });
  });
});
