type FormulaContext = Record<string, unknown>;

function flatten(values: unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? flatten(value) : [value]));
}

function numeric(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return 0;
}

export function evaluateFormulaExpression(expression: string, context: FormulaContext): unknown {
  const IF = (condition: unknown, trueValue: unknown, falseValue: unknown) =>
    condition ? trueValue : falseValue;
  const CONCAT = (...args: unknown[]) => args.map((value) => String(value ?? "")).join("");
  const SUM = (...args: unknown[]): number =>
    flatten(args).reduce<number>((acc, value) => acc + numeric(value), 0);
  const AVG = (...args: unknown[]) => {
    const values = flatten(args).map((value) => numeric(value));
    return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
  };
  const MIN = (...args: unknown[]) => {
    const values = flatten(args).map((value) => numeric(value));
    return values.length ? Math.min(...values) : 0;
  };
  const MAX = (...args: unknown[]) => {
    const values = flatten(args).map((value) => numeric(value));
    return values.length ? Math.max(...values) : 0;
  };
  const DAYS = (start: unknown, end: unknown) => {
    const startDate = new Date(String(start));
    const endDate = new Date(String(end));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
  };
  const TODAY = () => new Date().toISOString().slice(0, 10);

  const transformed = expression.replace(/\{([^}]+)\}/g, (_, title: string) => {
    const escaped = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `__col("${escaped}")`;
  });

  const fn = new Function(
    "__col",
    "SUM",
    "AVG",
    "MIN",
    "MAX",
    "IF",
    "CONCAT",
    "DAYS",
    "TODAY",
    `return (${transformed});`
  ) as (
    col: (title: string) => unknown,
    SUM: (...args: unknown[]) => number,
    AVG: (...args: unknown[]) => number,
    MIN: (...args: unknown[]) => number,
    MAX: (...args: unknown[]) => number,
    IF: (condition: unknown, trueValue: unknown, falseValue: unknown) => unknown,
    CONCAT: (...args: unknown[]) => string,
    DAYS: (start: unknown, end: unknown) => number,
    TODAY: () => string
  ) => unknown;

  return fn(
    (title: string) => context[title] ?? 0,
    SUM,
    AVG,
    MIN,
    MAX,
    IF,
    CONCAT,
    DAYS,
    TODAY
  );
}
