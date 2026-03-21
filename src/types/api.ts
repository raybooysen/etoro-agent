import { z } from "zod";

export const OpenOrderByAmountSchema = z.object({
  InstrumentID: z.number().int().positive(),
  IsBuy: z.boolean(),
  Leverage: z.number().int().positive(),
  Amount: z.number().positive(),
  StopLossRate: z.number().positive().optional(),
  TakeProfitRate: z.number().positive().optional(),
  IsTslEnabled: z.boolean().optional(),
  IsNoStopLoss: z.boolean().optional(),
  IsNoTakeProfit: z.boolean().optional(),
});

export type OpenOrderByAmount = z.infer<typeof OpenOrderByAmountSchema>;

export const OpenOrderByUnitsSchema = z.object({
  InstrumentID: z.number().int().positive(),
  IsBuy: z.boolean(),
  Leverage: z.number().int().positive(),
  AmountInUnits: z.number().positive(),
  StopLossRate: z.number().positive().optional(),
  TakeProfitRate: z.number().positive().optional(),
  IsTslEnabled: z.boolean().optional(),
  IsNoStopLoss: z.boolean().optional(),
  IsNoTakeProfit: z.boolean().optional(),
});

export type OpenOrderByUnits = z.infer<typeof OpenOrderByUnitsSchema>;

export const ClosePositionSchema = z.object({
  InstrumentID: z.number().int().positive().optional(),
  UnitsToDeduct: z.number().positive().optional(),
});

export type ClosePosition = z.infer<typeof ClosePositionSchema>;

export const LimitOrderSchema = z.object({
  InstrumentID: z.number().int().positive(),
  IsBuy: z.boolean(),
  Leverage: z.number().int().positive(),
  Amount: z.number().positive().optional(),
  AmountInUnits: z.number().positive().optional(),
  Rate: z.number().positive(),
  StopLossRate: z.number().positive().optional(),
  TakeProfitRate: z.number().positive().optional(),
  IsTslEnabled: z.boolean().optional(),
  IsNoStopLoss: z.boolean().optional(),
  IsNoTakeProfit: z.boolean().optional(),
});

export type LimitOrder = z.infer<typeof LimitOrderSchema>;

export const CreatePostSchema = z.object({
  message: z.string().min(1),
  owner: z.number().int().positive(),
  tags: z.array(z.string()).optional(),
  mentions: z.array(z.number().int().positive()).optional(),
});

export type CreatePost = z.infer<typeof CreatePostSchema>;

export const CreateCommentSchema = z.object({
  message: z.string().min(1),
});

export type CreateComment = z.infer<typeof CreateCommentSchema>;

export const CreateWatchlistSchema = z.object({
  name: z.string().min(1),
});

export type CreateWatchlist = z.infer<typeof CreateWatchlistSchema>;

export const CreateAgentPortfolioSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export type CreateAgentPortfolio = z.infer<typeof CreateAgentPortfolioSchema>;
