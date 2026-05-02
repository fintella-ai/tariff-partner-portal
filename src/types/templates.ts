export type TemplateStatus = "draft" | "active" | "archived";
export type TemplateType = "email" | "sms";
export type VariableCategory = "partner" | "referral" | "financial" | "system";
export interface TemplateVariable { id: string; key: string; label: string; description: string | null; category: VariableCategory; example: string | null; createdAt: Date; }
export interface CommunicationStyle { id: string; name: string; description: string; systemPrompt: string; isGlobal: boolean; createdAt: Date; }
export interface WorkflowAction { id: string; name: string; tag: string; description: string | null; templateType: string; requiredVariables: string[]; createdAt: Date; }
export interface GenerateEmailRequest { prompt: string; styleId: string; workflowContext?: string; existingTemplateId?: string; }
export interface GenerateEmailResponse { id: string; name: string; subject: string; bodyHtml: string; bodyText: string; detectedVariables: string[]; suggestedWorkflowTags: string[]; grammarNotes: string[]; confidenceScore: number; }
export interface GenerateSmsRequest { prompt: string; styleId: string; enforceCharLimit?: boolean; maxChars?: number; }
export interface GenerateSmsResponse { id: string; name: string; body: string; characterCount: number; segmentCount: number; detectedVariables: string[]; suggestedWorkflowTags: string[]; warnings: string[]; }
export interface RewriteRequest { templateId: string; type: TemplateType; styleId: string; }
export interface RewriteResponse { id: string; rewritten: string; changesSummary: string[]; originalVersion: number; newVersion: number; }
