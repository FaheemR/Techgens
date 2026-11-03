"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AgentDetailDTO,
  ApprovalDetailDTO,
  ApprovalSummaryDTO,
  AzureSetupDTO,
  BudgetDTO,
  CompanyDTO,
  DashboardDTO,
  DecisionDTO,
  DeploymentDTO,
  DocumentDTO,
  DocumentSummaryDTO,
  GoalDTO,
  IncidentDTO,
  InitiativeDetailDTO,
  InitiativeSummaryDTO,
  JobDTO,
  LiveEvent,
  MessageDTO,
  ModelOptionDTO,
  NotificationDTO,
  OrgDTO,
  ProductDTO,
  RoutineDTO,
  SettingsDTO,
  SystemInfo,
  ThreadDTO,
  UsageSummaryDTO,
  WorkItemDTO,
} from "@techgens/core";
import { api, type QueryParams } from "./api";

export type WorkItemDetail = WorkItemDTO & { children: WorkItemDTO[]; jobs: JobDTO[] };
export type JobDetail = JobDTO & { events: LiveEvent[] };
export interface WorkItemFilters {
  initiativeId?: string | undefined;
  status?: string | undefined;
  kind?: string | undefined;
  assigneeAgentId?: string | undefined;
  parentId?: string | undefined;
}
export interface JobFilters {
  status?: string | undefined;
  agentId?: string | undefined;
  limit?: number | undefined;
}
export interface DocumentFilters {
  initiativeId?: string | undefined;
  kind?: string | undefined;
  q?: string | undefined;
}
export interface EventFilters {
  limit?: number | undefined;
  before?: string | undefined;
  subjectType?: string | undefined;
  subjectId?: string | undefined;
}

/**
 * Query keys. The first element is the invalidation root used by the live event bridge
 * (see `src/lib/events.ts`), so list and detail queries of a resource share it.
 */
export const qk = {
  system: ["system"] as const,
  dashboard: ["dashboard"] as const,
  company: ["company"] as const,
  goals: ["goals"] as const,
  products: ["products"] as const,
  product: (id: string) => ["products", "detail", id] as const,
  azureSetup: (id: string) => ["products", "azure-setup", id] as const,
  initiatives: (status?: string) => ["initiatives", "list", status ?? "all"] as const,
  initiative: (id: string) => ["initiatives", "detail", id] as const,
  threads: ["chat", "threads"] as const,
  messages: (threadId: string) => ["chat", "messages", threadId] as const,
  org: ["org"] as const,
  agent: (id: string) => ["agents", id] as const,
  workItems: (filters: WorkItemFilters) => ["work-items", "list", filters] as const,
  workItem: (id: string) => ["work-items", "detail", id] as const,
  jobs: (filters: JobFilters) => ["jobs", "list", filters] as const,
  job: (id: string) => ["jobs", "detail", id] as const,
  documents: (filters: DocumentFilters) => ["documents", "list", filters] as const,
  document: (id: string, version?: number) => ["documents", "detail", id, version ?? "latest"] as const,
  decisions: (initiativeId?: string) => ["decisions", initiativeId ?? "all"] as const,
  approvals: (status?: string) => ["approvals", "list", status ?? "all"] as const,
  approval: (id: string) => ["approvals", "detail", id] as const,
  usage: (days: number) => ["usage", days] as const,
  budgets: ["budgets"] as const,
  deployments: ["deployments"] as const,
  incidents: ["incidents"] as const,
  routines: ["routines"] as const,
  notifications: ["notifications"] as const,
  settings: ["settings"] as const,
  models: ["models"] as const,
  events: (filters: EventFilters) => ["events", filters] as const,
};

function params<T extends object>(filters: T): QueryParams {
  return filters as unknown as QueryParams;
}

export function useSystem() {
  return useQuery({
    queryKey: qk.system,
    queryFn: ({ signal }) => api.get<SystemInfo>("/api/system", undefined, signal),
    refetchInterval: (query) => (query.state.status === "error" ? 5_000 : 30_000),
    retry: false,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: ({ signal }) => api.get<DashboardDTO>("/api/dashboard", undefined, signal),
    refetchInterval: 60_000,
  });
}

export function useCompany() {
  return useQuery({
    queryKey: qk.company,
    queryFn: ({ signal }) => api.get<CompanyDTO>("/api/company", undefined, signal),
  });
}

export function useGoals() {
  return useQuery({
    queryKey: qk.goals,
    queryFn: ({ signal }) => api.get<GoalDTO[]>("/api/goals", undefined, signal),
  });
}

export function useProducts() {
  return useQuery({
    queryKey: qk.products,
    queryFn: ({ signal }) => api.get<ProductDTO[]>("/api/products", undefined, signal),
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: qk.product(id ?? ""),
    queryFn: ({ signal }) => api.get<ProductDTO>(`/api/products/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useAzureSetup(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.azureSetup(id ?? ""),
    queryFn: ({ signal }) => api.get<AzureSetupDTO>(`/api/products/${id}/azure-setup`, undefined, signal),
    enabled: Boolean(id) && enabled,
  });
}

export function useInitiatives(status?: string) {
  return useQuery({
    queryKey: qk.initiatives(status),
    queryFn: ({ signal }) => api.get<InitiativeSummaryDTO[]>("/api/initiatives", { status }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useInitiative(id: string) {
  return useQuery({
    queryKey: qk.initiative(id),
    queryFn: ({ signal }) => api.get<InitiativeDetailDTO>(`/api/initiatives/${id}`, undefined, signal),
  });
}

export function useThreads() {
  return useQuery({
    queryKey: qk.threads,
    queryFn: ({ signal }) => api.get<ThreadDTO[]>("/api/chat/threads", undefined, signal),
  });
}

export function useMessages(threadId: string | null) {
  return useQuery({
    queryKey: qk.messages(threadId ?? ""),
    queryFn: ({ signal }) =>
      api.get<MessageDTO[]>(`/api/chat/threads/${threadId}/messages`, undefined, signal),
    enabled: Boolean(threadId),
  });
}

export function useOrg() {
  return useQuery({
    queryKey: qk.org,
    queryFn: ({ signal }) => api.get<OrgDTO>("/api/org", undefined, signal),
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: qk.agent(id ?? ""),
    queryFn: ({ signal }) => api.get<AgentDetailDTO>(`/api/agents/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useWorkItems(filters: WorkItemFilters, enabled = true) {
  return useQuery({
    queryKey: qk.workItems(filters),
    queryFn: ({ signal }) => api.get<WorkItemDTO[]>("/api/work-items", params(filters), signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useWorkItem(id: string | null) {
  return useQuery({
    queryKey: qk.workItem(id ?? ""),
    queryFn: ({ signal }) => api.get<WorkItemDetail>(`/api/work-items/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useJobs(filters: JobFilters) {
  return useQuery({
    queryKey: qk.jobs(filters),
    queryFn: ({ signal }) => api.get<JobDTO[]>("/api/jobs", params(filters), signal),
    placeholderData: keepPreviousData,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: qk.job(id),
    queryFn: ({ signal }) => api.get<JobDetail>(`/api/jobs/${id}`, undefined, signal),
  });
}

/** Like `useJob`, but idle until there is an id (e.g. a chat reply whose job id isn't known yet). */
export function useJobDetail(id: string | null) {
  return useQuery({
    queryKey: qk.job(id ?? ""),
    queryFn: ({ signal }) => api.get<JobDetail>(`/api/jobs/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: qk.documents(filters),
    queryFn: ({ signal }) => api.get<DocumentSummaryDTO[]>("/api/documents", params(filters), signal),
    placeholderData: keepPreviousData,
  });
}

export function useDocument(id: string, version?: number) {
  return useQuery({
    queryKey: qk.document(id, version),
    queryFn: ({ signal }) => api.get<DocumentDTO>(`/api/documents/${id}`, { version }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useDecisions(initiativeId?: string) {
  return useQuery({
    queryKey: qk.decisions(initiativeId),
    queryFn: ({ signal }) => api.get<DecisionDTO[]>("/api/decisions", { initiativeId }, signal),
  });
}

export function useApprovals(status?: string) {
  return useQuery({
    queryKey: qk.approvals(status),
    queryFn: ({ signal }) => api.get<ApprovalSummaryDTO[]>("/api/approvals", { status }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useApproval(id: string | null) {
  return useQuery({
    queryKey: qk.approval(id ?? ""),
    queryFn: ({ signal }) => api.get<ApprovalDetailDTO>(`/api/approvals/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useUsage(days: number) {
  return useQuery({
    queryKey: qk.usage(days),
    queryFn: ({ signal }) => api.get<UsageSummaryDTO>("/api/usage/summary", { days }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useBudgets() {
  return useQuery({
    queryKey: qk.budgets,
    queryFn: ({ signal }) => api.get<BudgetDTO[]>("/api/budgets", undefined, signal),
  });
}

export function useDeployments() {
  return useQuery({
    queryKey: qk.deployments,
    queryFn: ({ signal }) => api.get<DeploymentDTO[]>("/api/deployments", undefined, signal),
  });
}

export function useIncidents() {
  return useQuery({
    queryKey: qk.incidents,
    queryFn: ({ signal }) => api.get<IncidentDTO[]>("/api/incidents", undefined, signal),
  });
}

export function useRoutines() {
  return useQuery({
    queryKey: qk.routines,
    queryFn: ({ signal }) => api.get<RoutineDTO[]>("/api/routines", undefined, signal),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: ({ signal }) => api.get<NotificationDTO[]>("/api/notifications", undefined, signal),
    refetchInterval: 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: ({ signal }) => api.get<SettingsDTO>("/api/settings", undefined, signal),
  });
}

export function useModels() {
  return useQuery({
    queryKey: qk.models,
    queryFn: ({ signal }) => api.get<ModelOptionDTO[]>("/api/settings/models", undefined, signal),
    staleTime: 5 * 60_000,
  });
}

export function useEvents(filters: EventFilters) {
  return useQuery({
    queryKey: qk.events(filters),
    queryFn: ({ signal }) => api.get<LiveEvent[]>("/api/events", params(filters), signal),
  });
}
