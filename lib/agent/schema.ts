import { z } from "zod";
import { proposedPlanSchema } from "../clinical/schema.ts";

export const publicUrlSchema = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") &&
    !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) &&
    !/^\[|^\d+(\.\d+){3}$/.test(url.hostname) && !url.hostname.endsWith(".local");
}, "Use a public HTTPS source URL");
export const agentSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), citation: z.string().regex(/^N[1-9][0-9]*$/).optional(), noteId: z.string().min(1), consultationDate: z.string() }),
  z.object({ kind: z.literal("web"), citation: z.string().regex(/^W[1-9][0-9]*$/).optional(), title: z.string(), url: publicUrlSchema, accessedAt: z.string().datetime() }),
]);
export const agentResponseSchema = z.object({
  status: z.literal("agent"),
  answer: z.string().min(1).max(20000),
  category: z.enum(["general", "clinical"]),
  sources: z.array(agentSourceSchema),
  notice: z.string().nullable(),
  clinical: z.object({
    differential: z.array(z.object({ condition: z.string().max(300), rationale: z.string().max(2000) })).max(10),
    medication_options: z.array(z.object({ name: z.string().max(300), considerations: z.string().max(2000) })).max(10),
    missing_information: z.array(z.string().max(1000)).max(20),
    plan: proposedPlanSchema.nullable(),
  }).nullable(),
});
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentSource = z.infer<typeof agentSourceSchema>;
