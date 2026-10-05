import { z } from 'zod'

export const ReportRoleSchema = z.enum(['driver', 'line_summary', 'advisor'])
export type ReportRole = z.infer<typeof ReportRoleSchema>
export const PathSchema = z.enum(['green', 'yellow', 'gray'])
export type Path = z.infer<typeof PathSchema>
export const EvidenceSchema = z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]), status: z.enum(['provided', 'unknown', 'not_applicable']), source: z.enum(['user', 'advisor', 'fixture']), updatedAt: z.string().datetime({ offset: true }) }).strict().superRefine((v, ctx) => {
  if ((v.status === 'provided') === (v.value === null)) ctx.addIssue({ code: 'custom', message: 'Provided fields need a value; unknown/not-applicable fields must be null' })
})
export type Evidence = z.infer<typeof EvidenceSchema>
export const DiagnosticFieldsSchema = z.record(z.string(), EvidenceSchema)
export type DiagnosticFields = z.infer<typeof DiagnosticFieldsSchema>
export const DiagnosticAnswerSchema = z.object({ questionId: z.string(), fields: DiagnosticFieldsSchema }).strict()
export type DiagnosticAnswer = z.infer<typeof DiagnosticAnswerSchema>
export const DiagnosticQuestionSchema = z.object({ id: z.string(), title: z.string(), hint: z.string().optional(), kind: z.enum(['cards', 'slider', 'vehicle', 'locations']), options: z.array(z.string()).optional() })
export type DiagnosticQuestion = z.infer<typeof DiagnosticQuestionSchema>
export const DemoSessionSchema = z.object({ id: z.string(), vehicle: z.string(), ownershipYears: z.number(), questionIndex: z.number(), revision: z.number().int().nonnegative(), fields: DiagnosticFieldsSchema, answers: z.array(DiagnosticAnswerSchema), reportFamilyId: z.string().optional(), reportId: z.string().optional() })
export type DemoSession = z.infer<typeof DemoSessionSchema>
export const SourceSchema = z.object({ label: z.string(), status: z.enum(['fixture', 'assumption', 'verified']), updatedAt: z.string() })
export const ResistanceSchema = z.object({ id: z.string(), title: z.string(), score: z.number(), description: z.string(), status: z.enum(['resolved', 'manageable', 'pending', 'high']), evidence: z.array(z.string()), improvement: z.string() })
export const PlanSchema = z.object({ name: z.string(), title: z.string(), description: z.string(), timing: z.string() })
export const JourneySchema = z.object({ label: z.string(), title: z.string(), detail: z.string() })
const TcoBreakdownSchema = z.object({ purchase:z.number(), energy:z.number(), maintenance:z.number(), tax:z.number() }).strict()
export const TcoAnalysisSchema = z.object({
  status:z.enum(['estimated','unavailable']), note:z.string(), version:z.string().optional(), comparisonVehicle:z.string().optional(), plannedOwnershipYears:z.number().int().optional(),
  breakEvenVsNewIceYears:z.number().nullable().optional(), breakEvenVsKeepYears:z.number().nullable().optional(),
  fiveYearSavingsVsNewIce:z.number().optional(), fiveYearSavingsVsKeep:z.number().optional(), annualEnergySavingsRate:z.number().optional(),
  annualEnergyCost:z.record(z.string(),z.number()).optional(),
  curves:z.object({years:z.array(z.number()),current:z.array(z.number()),newIce:z.array(z.number()),bz4x:z.array(z.number())}).strict().optional(),
  fiveYearBreakdown:z.record(z.string(),TcoBreakdownSchema).optional(), inputs:z.record(z.string(),z.number()).optional(), inputSources:z.record(z.string(),z.string()).optional(),
}).strict()
export const ReportV02Schema = z.object({
  contractVersion: z.literal('0.2'), reportFamilyId: z.string(), inputRevision: z.number().int(), ruleVersion: z.string(), dataSnapshotIds: z.array(z.string()), kind: z.enum(['actual', 'simulation']), basedOnReportId: z.string().nullable(), changeSummary: z.array(z.string()), evaluationStatus: z.enum(['assessed', 'needs_confirmation']), route: z.enum(['ready', 'home_install_required', 'public_charging_ready', 'not_ready']).nullable(), chargingDataStatus: z.enum(['available', 'no_data', 'no_nearby_station', 'provider_error']), id: z.string(), sessionId: z.string(), version: z.number(), createdAt: z.string(), path: PathSchema.nullable(),
  pathLabel: z.string(), headline: z.string(), summary: z.string(), completeness: z.number(), vehicle: z.string(), ownershipYears: z.number(),
  resistances: z.array(ResistanceSchema), plans: z.array(PlanSchema), journeys: z.array(JourneySchema),
  monthlyCost: z.object({ status: z.enum(['estimated', 'unavailable']), min: z.number().nullable(), max: z.number().nullable(), note: z.string(), unit: z.literal('TWD/month'), inputs: z.record(z.string(), z.number()), formula: z.string() }), tcoAnalysis:TcoAnalysisSchema.nullable().optional(), assumptions: z.array(z.string()), sources: z.array(SourceSchema),
  recommendations: z.array(z.string()), successCases: z.array(z.string()), nextActions: z.array(z.object({ label: z.string(), kind: z.enum(['consult', 'test-drive', 'reevaluate']) })),
  preciseLocations: z.object({ home: z.string(), work: z.string(), leisure: z.string() }), blurredLocations: z.array(z.string()),
  advisorNotes: z.array(z.string()), pendingConfirmations: z.array(z.string()), suggestedQuestions: z.array(z.string()),
})
export const PublicSourceV03Schema = SourceSchema.extend({
  snapshotId: z.string(), sourceKind: z.enum(['official','tdx','assumption','demo']), origin: z.string(),
  retrievedAt: z.string().datetime({offset:true}), sourceUpdatedAt: z.string().datetime({offset:true}).nullable(),
  freshness: z.enum(['fresh','stale','unknown']), coverage: z.enum(['complete','partial','none']), missingFields: z.array(z.string()),
}).strict()
export const CitationSchema = z.object({id:z.string(),text:z.string(),origin:z.string().url(),locator:z.string(),contentHash:z.string()}).strict()
export const ReportV03Schema = ReportV02Schema.extend({
  contractVersion:z.literal('0.3'), targetVehicleProfileId:z.string(), engineVersion:z.string(), composerVersion:z.string(),
  evaluatedAt:z.string().datetime({offset:true}), generationMode:z.enum(['template','llm']),
  sources:z.array(PublicSourceV03Schema), citations:z.array(CitationSchema),
  plans:z.array(PlanSchema.extend({purpose:z.enum(['daily','backup','destination_only']),stationIds:z.array(z.string()),snapshotIds:z.array(z.string()),limitations:z.array(z.string())}).strict()),
  composition:z.object({actions:z.array(z.object({label:z.string(),kind:z.enum(['consult','test-drive','reevaluate'])}).strict()),citations:z.array(CitationSchema),explanation:z.array(z.string())}).strict(),
}).strict()
export const ReportSchema = z.discriminatedUnion('contractVersion',[ReportV02Schema,ReportV03Schema])
export type VersionedReport = z.infer<typeof ReportSchema>
export const SimulationConditionSchema = z.object({ type: z.literal('home-charger-approved'), value: z.boolean() }).strict()
export type SimulationCondition = z.infer<typeof SimulationConditionSchema>
export type ConfirmedCondition = SimulationCondition
export const DriverProjectionSchema = z.discriminatedUnion('contractVersion',[
  ReportV02Schema.omit({preciseLocations:true,advisorNotes:true,suggestedQuestions:true}).strict(),
  ReportV03Schema.omit({preciseLocations:true,advisorNotes:true,suggestedQuestions:true}).strict(),
])
export const AdvisorProjectionSchema = z.discriminatedUnion('contractVersion',[
  ReportV02Schema.omit({preciseLocations:true}).strict(),ReportV03Schema.omit({preciseLocations:true}).strict(),
])
// LINE receives the same public schema; compact rendering is a presentation choice.
export const LineProjectionSchema = DriverProjectionSchema
export type DriverProjection = z.infer<typeof DriverProjectionSchema>
export type AdvisorProjection = z.infer<typeof AdvisorProjectionSchema>
export type LineProjection = DriverProjection
export type ReportProjection = DriverProjection | AdvisorProjection
export const ProjectionSchemas = { driver: DriverProjectionSchema, line_summary: LineProjectionSchema, advisor: AdvisorProjectionSchema }
export function validateDecision<T extends DriverProjection>(r: T): T {
  const lamps = { ready: 'green', home_install_required: 'yellow', public_charging_ready: 'yellow', not_ready: 'gray' }
  if (r.evaluationStatus === 'needs_confirmation' ? r.path !== null || r.route !== null : r.route === null || lamps[r.route] !== r.path) throw new Error('Invalid decision status')
  if ((!r.path || r.path === 'gray') && (r.recommendations.length || r.successCases.length || r.nextActions.some(a => a.kind !== 'reevaluate'))) throw new Error('Unsupported sales recommendation')
  if (r.monthlyCost.status === 'unavailable' ? r.monthlyCost.min !== null || r.monthlyCost.max !== null : r.monthlyCost.min === null || r.monthlyCost.max === null || r.monthlyCost.min < 0 || r.monthlyCost.max < r.monthlyCost.min) throw new Error('Invalid cost')
  return r
}
