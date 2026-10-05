import { z } from 'zod'

export const ReportRoleSchema = z.enum(['driver', 'line_summary', 'advisor'])
export type ReportRole = z.infer<typeof ReportRoleSchema>
export const PathSchema = z.enum(['green', 'yellow', 'gray'])
export type Path = z.infer<typeof PathSchema>
export const DiagnosticAnswerSchema = z.object({ questionId: z.string(), value: z.union([z.string(), z.number(), z.array(z.string())]) })
export type DiagnosticAnswer = z.infer<typeof DiagnosticAnswerSchema>
export const DiagnosticQuestionSchema = z.object({ id: z.string(), title: z.string(), hint: z.string().optional(), kind: z.enum(['cards', 'slider', 'vehicle', 'locations']), options: z.array(z.string()).optional() })
export type DiagnosticQuestion = z.infer<typeof DiagnosticQuestionSchema>
export const DemoSessionSchema = z.object({ id: z.string(), vehicle: z.string(), ownershipYears: z.number(), questionIndex: z.number(), answers: z.array(DiagnosticAnswerSchema), reportId: z.string().optional() })
export type DemoSession = z.infer<typeof DemoSessionSchema>
export const SourceSchema = z.object({ label: z.string(), status: z.enum(['fixture', 'assumption', 'verified']), updatedAt: z.string() })
export const ResistanceSchema = z.object({ id: z.string(), title: z.string(), score: z.number(), description: z.string(), status: z.enum(['resolved', 'manageable', 'pending', 'high']) })
export const PlanSchema = z.object({ name: z.string(), title: z.string(), description: z.string(), timing: z.string() })
export const JourneySchema = z.object({ label: z.string(), title: z.string(), detail: z.string() })
export const ReportSchema = z.object({
  contractVersion: z.literal('0.1'), id: z.string(), sessionId: z.string(), version: z.number(), createdAt: z.string(), path: PathSchema,
  pathLabel: z.string(), headline: z.string(), summary: z.string(), completeness: z.number(), vehicle: z.string(), ownershipYears: z.number(),
  resistances: z.array(ResistanceSchema), plans: z.array(PlanSchema), journeys: z.array(JourneySchema),
  monthlyCost: z.object({ min: z.number(), max: z.number(), note: z.string() }), assumptions: z.array(z.string()), sources: z.array(SourceSchema),
  recommendations: z.array(z.string()), successCases: z.array(z.string()), nextActions: z.array(z.object({ label: z.string(), kind: z.enum(['consult', 'test-drive', 'reevaluate']) })),
  preciseLocations: z.object({ home: z.string(), work: z.string(), leisure: z.string() }), blurredLocations: z.array(z.string()),
  advisorNotes: z.array(z.string()), pendingConfirmations: z.array(z.string()), suggestedQuestions: z.array(z.string()),
})
export type VersionedReport = z.infer<typeof ReportSchema>
export const SimulationConditionSchema = z.object({ type: z.literal('home-charger-approved'), value: z.boolean() })
export type SimulationCondition = z.infer<typeof SimulationConditionSchema>
export type ConfirmedCondition = SimulationCondition
export type DriverProjection = Omit<VersionedReport, 'preciseLocations' | 'advisorNotes' | 'suggestedQuestions'>
export type LineProjection = Pick<VersionedReport, 'id' | 'version' | 'path' | 'pathLabel' | 'headline' | 'summary' | 'resistances' | 'nextActions'>
export type AdvisorProjection = Omit<VersionedReport, 'preciseLocations'>
export type ReportProjection = DriverProjection | LineProjection | AdvisorProjection
