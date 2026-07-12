import { Elysia } from "elysia";
import { z } from "zod";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressSchema, historyEntrySchema } from "@/core/wallet/domain/schemas";
import { toHistoryDTO } from "@/core/wallet/domain/types";
import { getWalletHistoryService } from "../../services/get-wallet-history-service";

export const getHistoryRoute = new Elysia().get(
  "/history",
  async ({ query, status }) => {
    const result = await getWalletHistoryService(query.address as `0x${string}`);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toHistoryDTO) }));
  },
  {
    query: z.object({ address: addressSchema }),
    response: {
      200: successResponseSchema(z.array(historyEntrySchema), "WalletHistory"),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Wallet"], summary: "USD₮ transfer history for an address" },
  },
);
