/**
 * Business-rule defaults, preserved from the original app (see
 * docs/architecture.md "Business-rule constants to preserve"). These are
 * fallbacks only — every place that uses one should prefer the group's own
 * configured value (groups.fineLateness, groups.fineAbsence, etc.) and only
 * fall back to these when the group hasn't customized it.
 */
export const DEFAULT_FINE_LATENESS = 50;
export const DEFAULT_FINE_ABSENCE = 100;
export const DEFAULT_FINE_RULE_VIOLATION = 500;
export const MIN_PERSONAL_SAVINGS_INCREMENT = 500;
export const MIN_LOAN_AMOUNT = 1000;
export const DEFAULT_LOAN_REPAYMENT_MONTHS = 3;
