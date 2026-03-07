// ============================================================
// Automations Engine — Condition Evaluator
// ============================================================

import type { Conditions, ConditionGroup, ConditionRule, TriggerData } from "./automation-types";

/**
 * Evaluate all condition groups against trigger data.
 * Groups are combined with AND logic — all groups must pass.
 * Within each group, rules are combined by the group's logicalOp (AND or OR).
 * Empty conditions = always match (no filtering).
 */
export function evaluateConditions(
  conditions: Conditions | unknown,
  triggerData: TriggerData,
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;

  return conditions.every((group) => evaluateGroup(group as ConditionGroup, triggerData));
}

function evaluateGroup(group: ConditionGroup, data: TriggerData): boolean {
  if (!group.rules || !Array.isArray(group.rules) || group.rules.length === 0) return true;

  const results = group.rules.map((rule) => evaluateRule(rule, data));

  if (group.logicalOp === "OR") {
    return results.some(Boolean);
  }
  // Default to AND
  return results.every(Boolean);
}

function evaluateRule(rule: ConditionRule, data: TriggerData): boolean {
  const fieldValue = getFieldValue(rule.field, data);

  switch (rule.operator) {
    case "equals":
      return String(fieldValue ?? "").toLowerCase() === String(rule.value ?? "").toLowerCase();

    case "not_equals":
      return String(fieldValue ?? "").toLowerCase() !== String(rule.value ?? "").toLowerCase();

    case "contains": {
      const strValue = String(fieldValue ?? "").toLowerCase();
      const search = String(rule.value ?? "").toLowerCase();
      return strValue.includes(search);
    }

    case "greater_than":
      return Number(fieldValue) > Number(rule.value);

    case "less_than":
      return Number(fieldValue) < Number(rule.value);

    case "is_empty":
      return fieldValue === null || fieldValue === undefined || fieldValue === "";

    case "is_not_empty":
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";

    default:
      return false;
  }
}

/**
 * Resolve a dot-notation field path against trigger data.
 * e.g. "source" → data.source, "contact.email" → data.contact.email
 */
function getFieldValue(field: string, data: TriggerData): unknown {
  const parts = field.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = data;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }

  return value;
}
