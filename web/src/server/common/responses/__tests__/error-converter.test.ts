import { describe } from "node:test";

// Both original cases in this file asserted the AI-quota `detail` field
// (bucket/limit/plan) on the error response. La Doce has no AI, so that
// field was removed from AppError/APIErrorResponse entirely — neither case
// has anything left to assert, so both were deleted per the strip-AI-quota
// task brief ("delete just that test case"). No other cases exercised
// errorToResponse, so this suite is currently empty.
describe("errorToResponse", () => {});
