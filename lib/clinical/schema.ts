import { z } from "zod";

export const clinicalContextSchema = z.object({
  confirmed_at: z.string().datetime().nullable().default(null),
  medication_context_confirmed: z.boolean().default(false),
  age: z.number().int().min(0).max(130).nullable().default(null),
  allergies: z.string().max(3000).default(""),
  current_medications: z.string().max(3000).default(""),
  pregnancy_status: z.string().max(300).default(""),
  kidney_function: z.string().max(1000).default(""),
  liver_function: z.string().max(1000).default(""),
  vitals: z.string().max(2000).default(""),
  current_concern: z.string().max(5000).default(""),
}).strict();
export type ClinicalContext = z.infer<typeof clinicalContextSchema>;

export const proposedPlanSchema = z.object({
  title: z.string().min(1).max(200),
  goals: z.array(z.string().max(2000)).max(10),
  next_steps: z.array(z.string().max(2000)).max(15),
  monitoring: z.array(z.string().max(2000)).max(10),
  follow_up: z.string().max(2000),
  red_flags: z.array(z.string().max(2000)).max(10),
}).strict();
export type ProposedPlan = z.infer<typeof proposedPlanSchema>;

