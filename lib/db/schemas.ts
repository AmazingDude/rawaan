import { z } from "zod";
import { agentResponseSchema } from "../agent/schema.ts";

export const patientSchema = z.object({
  id: z.string().trim().min(1),
  display_name: z.string().trim().min(1),
  first_name: z.string().nullable().transform((value) => value ?? ""),
  last_name: z.string().nullable().transform((value) => value ?? ""),
  email: z.string().nullable().transform((value) => value ?? ""),
  mobile_number: z.string().nullable().transform((value) => value ?? ""),
});

export const storedChatResponseSchema = z.discriminatedUnion("status", [
  agentResponseSchema,
  z.object({
    status: z.literal("supported"), answer: z.string(),
    sources: z.array(z.object({ noteId: z.string(), consultationDate: z.string() })),
  }),
  z.object({
    status: z.literal("no_supporting_record"),
    reason: z.enum(["no_approved_notes", "no_relevant_evidence"]),
    message: z.literal("No record of that for this patient."),
  }),
  z.object({
    status: z.literal("refused"), reason: z.enum(["general_medical", "treatment_or_medication"]),
    message: z.literal("This tool only retrieves documented patient history and does not provide general medical or treatment advice."),
  }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);
export const chatRowSchema = z.object({
  id: z.string().min(1), patient_id: z.string().min(1), thread_id: z.string().min(1),
  question: z.string().trim().min(1), response: storedChatResponseSchema, timestamp: z.string().datetime(),
});
