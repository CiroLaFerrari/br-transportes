export type PlanStatus = "DRAFT" | "PLANNED" | "IN_TRANSIT" | "DONE" | "CANCELED";

export const STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: "Rascunho",
  PLANNED: "Planejado",
  IN_TRANSIT: "Em Trânsito",
  DONE: "Concluído",
  CANCELED: "Cancelado",
};
