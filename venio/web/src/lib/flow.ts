export type Option = { value: string; label: string; description?: string; icon?: string };
export type Step = {
  id: string;
  type: "single_choice" | "multi_choice" | "yes_no" | "text" | "long_text" | "number" | "slider" | "date" | "photos";
  title: string; help?: string; required: boolean; options: Option[];
  min?: number; max?: number; step?: number; unit?: string; placeholder?: string; max_files: number;
  routes?: unknown[]; next?: string;
};
export type FlowDefinition = { version: 1; intro?: string; steps: Step[]; service_rules: unknown[] };
export type FlowState = {
  current_step: string | null; visited: string[]; answered: number; estimated_total: number;
  progress: number; qualification_done: boolean; service_key: string | null;
};
export type Answers = Record<string, unknown>;

export function displayValue(step: Step, value: unknown): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  switch (step.type) {
    case "single_choice": return step.options.find((o) => o.value === value)?.label ?? String(value);
    case "multi_choice": return (value as string[]).map((v) => step.options.find((o) => o.value === v)?.label ?? v).join(", ");
    case "yes_no": return value ? "Oui" : "Non";
    case "photos": return `${(value as string[]).length} fichier(s)`;
    case "date": return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR");
    case "number": case "slider": return step.unit ? `${value} ${step.unit}` : String(value);
    default: return String(value);
  }
}
