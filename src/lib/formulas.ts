type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "column_ref"
  | "operator"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

type ExprNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "column_ref"; key: string }
  | { type: "unary"; operator: string; argument: ExprNode }
  | { type: "binary"; operator: string; left: ExprNode; right: ExprNode }
  | { type: "function_call"; name: string; args: ExprNode[] };

export interface FormulaEvaluationContext {
  currentItemValues?: Record<string, unknown>;
  boardColumnValues?: Record<string, unknown[]>;
  boardItemValues?: Array<Record<string, unknown>>;
  now?: Date;
}

const AGGREGATE_FUNCTIONS = new Set(["SUM", "AVG", "COUNT", "MIN", "MAX"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  const push = (type: TokenType, value: string, position: number) => {
    tokens.push({ type, value, position });
  };

  while (index < input.length) {
    const char = input[index];
    if (!char) break;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(") {
      push("lparen", char, index);
      index += 1;
      continue;
    }

    if (char === ")") {
      push("rparen", char, index);
      index += 1;
      continue;
    }

    if (char === ",") {
      push("comma", char, index);
      index += 1;
      continue;
    }

    if (char === "{") {
      const start = index;
      const end = input.indexOf("}", start + 1);
      if (end === -1) {
        throw new Error(`Unclosed column reference at position ${start}`);
      }
      const key = input.slice(start + 1, end).trim();
      if (!key) {
        throw new Error(`Empty column reference at position ${start}`);
      }
      push("column_ref", key, start);
      index = end + 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      const start = index;
      index += 1;
      let value = "";
      while (index < input.length) {
        const next = input[index];
        if (!next) break;
        if (next === "\\") {
          const escaped = input[index + 1];
          if (!escaped) break;
          value += escaped;
          index += 2;
          continue;
        }
        if (next === quote) {
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }
      if (input[index - 1] !== quote) {
        throw new Error(`Unclosed string at position ${start}`);
      }
      push("string", value, start);
      continue;
    }

    const twoChar = input.slice(index, index + 2);
    if (["<=", ">=", "<>"] .includes(twoChar)) {
      push("operator", twoChar, index);
      index += 2;
      continue;
    }

    if (["+", "-", "*", "/", "^", "=", "<", ">"].includes(char)) {
      push("operator", char, index);
      index += 1;
      continue;
    }

    if (/\d/.test(char) || (char === "." && /\d/.test(input[index + 1] ?? ""))) {
      const start = index;
      index += 1;
      while (index < input.length && /[\d.]/.test(input[index] ?? "")) {
        index += 1;
      }
      const raw = input.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number at position ${start}`);
      }
      push("number", raw, start);
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index] ?? "")) {
        index += 1;
      }
      push("identifier", input.slice(start, index), start);
      continue;
    }

    throw new Error(`Unexpected token \"${char}\" at position ${index}`);
  }

  push("eof", "", index);
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): ExprNode {
    const expr = this.parseComparison();
    this.expect("eof");
    return expr;
  }

  private parseComparison(): ExprNode {
    let left = this.parseAdditive();
    while (this.matchOperator(["=", "<>", "<", ">", "<=", ">="])) {
      const op = this.previous().value;
      const right = this.parseAdditive();
      left = { type: "binary", operator: op, left, right };
    }
    return left;
  }

  private parseAdditive(): ExprNode {
    let left = this.parseMultiplicative();
    while (this.matchOperator(["+", "-"])) {
      const op = this.previous().value;
      const right = this.parseMultiplicative();
      left = { type: "binary", operator: op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ExprNode {
    let left = this.parsePower();
    while (this.matchOperator(["*", "/"])) {
      const op = this.previous().value;
      const right = this.parsePower();
      left = { type: "binary", operator: op, left, right };
    }
    return left;
  }

  private parsePower(): ExprNode {
    let left = this.parseUnary();
    while (this.matchOperator(["^"])) {
      const op = this.previous().value;
      const right = this.parseUnary();
      left = { type: "binary", operator: op, left, right };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    if (this.matchOperator(["+", "-"])) {
      const op = this.previous().value;
      const argument = this.parseUnary();
      return { type: "unary", operator: op, argument };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode {
    if (this.match("number")) {
      return { type: "number", value: Number(this.previous().value) };
    }

    if (this.match("string")) {
      return { type: "string", value: this.previous().value };
    }

    if (this.match("column_ref")) {
      return { type: "column_ref", key: this.previous().value };
    }

    if (this.match("identifier")) {
      const token = this.previous();
      const upper = token.value.toUpperCase();

      if (upper === "TRUE") return { type: "boolean", value: true };
      if (upper === "FALSE") return { type: "boolean", value: false };

      if (this.match("lparen")) {
        const args: ExprNode[] = [];
        if (!this.check("rparen")) {
          do {
            args.push(this.parseComparison());
          } while (this.match("comma"));
        }
        this.expect("rparen", `Expected ) after function arguments for ${token.value}`);
        return { type: "function_call", name: upper, args };
      }

      return { type: "column_ref", key: token.value };
    }

    if (this.match("lparen")) {
      const expr = this.parseComparison();
      this.expect("rparen", "Expected ) after expression");
      return expr;
    }

    const next = this.peek();
    throw new Error(`Unexpected token \"${next.value}\" at position ${next.position}`);
  }

  private match(type: TokenType) {
    if (!this.check(type)) return false;
    this.index += 1;
    return true;
  }

  private matchOperator(operators: string[]) {
    if (!this.check("operator")) return false;
    const token = this.peek();
    if (!operators.includes(token.value)) return false;
    this.index += 1;
    return true;
  }

  private expect(type: TokenType, message?: string) {
    if (!this.check(type)) {
      const token = this.peek();
      throw new Error(message ?? `Expected ${type} at position ${token.position}`);
    }
    this.index += 1;
    return this.previous();
  }

  private check(type: TokenType) {
    return this.peek().type === type;
  }

  private peek() {
    return this.tokens[this.index] as Token;
  }

  private previous() {
    return this.tokens[this.index - 1] as Token;
  }
}

function flatten(values: unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? flatten(value) : [value]));
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

function toString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function isTruthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function resolveCurrentValue(context: FormulaEvaluationContext, key: string): unknown {
  const source = context.currentItemValues ?? {};
  if (key in source) return source[key];
  const target = normalizeKey(key);
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (normalizeKey(entryKey) === target) return entryValue;
  }
  return null;
}

function resolveBoardValues(context: FormulaEvaluationContext, key: string): unknown[] {
  const source = context.boardColumnValues ?? {};
  if (key in source) return source[key] ?? [];
  const target = normalizeKey(key);
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (normalizeKey(entryKey) === target) return entryValue ?? [];
  }
  return [];
}

function resolveRowValue(row: Record<string, unknown>, key: string): unknown {
  if (key in row) return row[key];
  const target = normalizeKey(key);
  for (const [entryKey, entryValue] of Object.entries(row)) {
    if (normalizeKey(entryKey) === target) return entryValue;
  }
  return null;
}

function resolveBoardSeries(context: FormulaEvaluationContext, key: string): unknown[] {
  const rows = context.boardItemValues ?? [];
  if (rows.length > 0) {
    return rows.map((row) => resolveRowValue(row, key));
  }
  return resolveBoardValues(context, key);
}

function getArgSeries(arg: ExprNode, evaluated: unknown, context: FormulaEvaluationContext): unknown[] {
  if (arg.type === "column_ref") {
    const boardSeries = resolveBoardSeries(context, arg.key);
    if (boardSeries.length > 0) return boardSeries;
    const currentValue = resolveCurrentValue(context, arg.key);
    return currentValue === null || currentValue === undefined ? [] : [currentValue];
  }
  if (Array.isArray(evaluated)) return flatten(evaluated);
  return [evaluated];
}

function compareValues(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }

  const leftDate = toDate(left);
  const rightDate = toDate(right);
  if (leftDate && rightDate) {
    const l = leftDate.getTime();
    const r = rightDate.getTime();
    return l === r ? 0 : l < r ? -1 : 1;
  }

  const leftText = toString(left);
  const rightText = toString(right);
  return leftText.localeCompare(rightText);
}

function formatDate(value: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return format
    .replace(/YYYY/g, String(value.getFullYear()))
    .replace(/MM/g, pad(value.getMonth() + 1))
    .replace(/DD/g, pad(value.getDate()))
    .replace(/HH/g, pad(value.getHours()))
    .replace(/mm/g, pad(value.getMinutes()))
    .replace(/ss/g, pad(value.getSeconds()));
}

function addDateUnit(value: Date, amount: number, unit: string): Date {
  const next = new Date(value);
  const normalized = unit.toLowerCase();
  if (normalized === "day" || normalized === "days") next.setDate(next.getDate() + amount);
  else if (normalized === "week" || normalized === "weeks") next.setDate(next.getDate() + amount * 7);
  else if (normalized === "month" || normalized === "months") next.setMonth(next.getMonth() + amount);
  else if (normalized === "year" || normalized === "years") next.setFullYear(next.getFullYear() + amount);
  else if (normalized === "hour" || normalized === "hours") next.setHours(next.getHours() + amount);
  else if (normalized === "minute" || normalized === "minutes") next.setMinutes(next.getMinutes() + amount);
  else if (normalized === "second" || normalized === "seconds") next.setSeconds(next.getSeconds() + amount);
  else next.setDate(next.getDate() + amount);
  return next;
}

function datedif(start: Date, end: Date, unit: string): number {
  const msDiff = end.getTime() - start.getTime();
  const normalized = unit.toLowerCase();
  if (normalized === "week" || normalized === "weeks") return Math.floor(msDiff / (86400000 * 7));
  if (normalized === "month" || normalized === "months") {
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return months;
  }
  return Math.floor(msDiff / 86400000);
}

function weekNumber(value: Date): number {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function evaluate(node: ExprNode, context: FormulaEvaluationContext): unknown {
  if (node.type === "number") return node.value;
  if (node.type === "string") return node.value;
  if (node.type === "boolean") return node.value;
  if (node.type === "column_ref") return resolveCurrentValue(context, node.key);

  if (node.type === "unary") {
    const value = evaluate(node.argument, context);
    if (node.operator === "-") return -toNumber(value);
    return toNumber(value);
  }

  if (node.type === "binary") {
    const left = evaluate(node.left, context);
    const right = evaluate(node.right, context);

    switch (node.operator) {
      case "+":
        if (typeof left === "string" || typeof right === "string") return `${toString(left)}${toString(right)}`;
        return toNumber(left) + toNumber(right);
      case "-":
        return toNumber(left) - toNumber(right);
      case "*":
        return toNumber(left) * toNumber(right);
      case "/":
        return toNumber(right) === 0 ? 0 : toNumber(left) / toNumber(right);
      case "^":
        return Math.pow(toNumber(left), toNumber(right));
      case "=":
        return compareValues(left, right) === 0;
      case "<>":
        return compareValues(left, right) !== 0;
      case "<":
        return compareValues(left, right) < 0;
      case ">":
        return compareValues(left, right) > 0;
      case "<=":
        return compareValues(left, right) <= 0;
      case ">=":
        return compareValues(left, right) >= 0;
      default:
        return null;
    }
  }

  if (node.type === "function_call") {
    const name = node.name.toUpperCase();

    const evaluatedArgs = node.args.map((arg) => evaluate(arg, context));

    if (name === "IF") {
      const [condition, trueValue, falseValue] = evaluatedArgs;
      return isTruthy(condition) ? trueValue : falseValue;
    }
    if (name === "AND") return evaluatedArgs.every(isTruthy);
    if (name === "OR") return evaluatedArgs.some(isTruthy);
    if (name === "NOT") return !isTruthy(evaluatedArgs[0]);

    if (name === "CONCAT") return evaluatedArgs.map(toString).join("");
    if (name === "LEFT") {
      const [input, length] = evaluatedArgs;
      return toString(input).slice(0, Math.max(0, Math.floor(toNumber(length))));
    }
    if (name === "RIGHT") {
      const [input, length] = evaluatedArgs;
      const text = toString(input);
      const count = Math.max(0, Math.floor(toNumber(length)));
      return count ? text.slice(-count) : "";
    }
    if (name === "LEN") return toString(evaluatedArgs[0]).length;
    if (name === "LOWER") return toString(evaluatedArgs[0]).toLowerCase();
    if (name === "UPPER") return toString(evaluatedArgs[0]).toUpperCase();
    if (name === "MID") {
      const text = toString(evaluatedArgs[0]);
      const start = Math.max(1, Math.floor(toNumber(evaluatedArgs[1])));
      const count = Math.max(0, Math.floor(toNumber(evaluatedArgs[2])));
      return text.slice(start - 1, start - 1 + count);
    }
    if (name === "SUBSTITUTE") {
      const [input, search, replacement] = evaluatedArgs;
      return toString(input).split(toString(search)).join(toString(replacement));
    }
    if (name === "TRIM") return toString(evaluatedArgs[0]).replace(/\s+/g, " ").trim();
    if (name === "TEXT") return toString(evaluatedArgs[0]);
    if (name === "VALUE") return toNumber(evaluatedArgs[0]);
    if (name === "FIND") {
      const needle = toString(evaluatedArgs[0]);
      const haystack = toString(evaluatedArgs[1]);
      const index = haystack.indexOf(needle);
      return index >= 0 ? index + 1 : 0;
    }

    if (name === "TODAY") {
      const now = context.now ?? new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    }
    if (name === "NOW") {
      const now = context.now ?? new Date();
      return now.toISOString();
    }
    if (name === "DAYS") {
      const start = toDate(evaluatedArgs[0]);
      const end = toDate(evaluatedArgs[1]);
      if (!start || !end) return 0;
      return Math.round((end.getTime() - start.getTime()) / 86400000);
    }
    if (name === "DATEADD") {
      const input = toDate(evaluatedArgs[0]);
      if (!input) return "";
      const amount = Math.floor(toNumber(evaluatedArgs[1]));
      const unit = toString(evaluatedArgs[2] ?? "days");
      return addDateUnit(input, amount, unit).toISOString();
    }
    if (name === "DATEDIF") {
      const start = toDate(evaluatedArgs[0]);
      const end = toDate(evaluatedArgs[1]);
      if (!start || !end) return 0;
      return datedif(start, end, toString(evaluatedArgs[2] ?? "days"));
    }
    if (name === "FORMAT_DATE") {
      const date = toDate(evaluatedArgs[0]);
      const format = toString(evaluatedArgs[1] ?? "YYYY-MM-DD");
      if (!date) return "";
      return formatDate(date, format);
    }
    if (name === "WEEKDAY") {
      const date = toDate(evaluatedArgs[0]);
      if (!date) return 0;
      return date.getDay() + 1;
    }
    if (name === "WEEKNUM") {
      const date = toDate(evaluatedArgs[0]);
      if (!date) return 0;
      return weekNumber(date);
    }

    if (name === "SWITCH") {
      if (evaluatedArgs.length < 3) return null;
      const target = evaluatedArgs[0];
      for (let i = 1; i + 1 < evaluatedArgs.length; i += 2) {
        if (compareValues(target, evaluatedArgs[i]) === 0) return evaluatedArgs[i + 1];
      }
      return evaluatedArgs.length % 2 === 0 ? evaluatedArgs[evaluatedArgs.length - 1] : null;
    }
    if (name === "IFS") {
      for (let i = 0; i + 1 < evaluatedArgs.length; i += 2) {
        if (isTruthy(evaluatedArgs[i])) return evaluatedArgs[i + 1];
      }
      return evaluatedArgs.length % 2 === 1 ? evaluatedArgs[evaluatedArgs.length - 1] : null;
    }
    if (name === "COALESCE") {
      for (const value of evaluatedArgs) {
        if (value !== null && value !== undefined) return value;
      }
      return null;
    }

    if (name === "ABS") return Math.abs(toNumber(evaluatedArgs[0]));
    if (name === "ROUND") {
      const value = toNumber(evaluatedArgs[0]);
      const digits = Math.max(0, Math.floor(toNumber(evaluatedArgs[1] ?? 0)));
      const precision = 10 ** digits;
      return Math.round(value * precision) / precision;
    }
    if (name === "CEIL") return Math.ceil(toNumber(evaluatedArgs[0]));
    if (name === "FLOOR") return Math.floor(toNumber(evaluatedArgs[0]));
    if (name === "MOD") return toNumber(evaluatedArgs[0]) % toNumber(evaluatedArgs[1]);
    if (name === "POWER") return Math.pow(toNumber(evaluatedArgs[0]), toNumber(evaluatedArgs[1]));
    if (name === "SQRT") return Math.sqrt(Math.max(0, toNumber(evaluatedArgs[0])));
    if (name === "LOG" || name === "LN") {
      const value = toNumber(evaluatedArgs[0]);
      if (value <= 0) return 0;
      return Math.log(value);
    }
    if (name === "PI") return Math.PI;
    if (name === "RAND") return Math.random();

    if (name === "COUNTIF" || name === "SUMIF" || name === "AVERAGEIF") {
      if (name === "COUNTIF") {
        const rangeValues = getArgSeries(node.args[0]!, evaluatedArgs[0], context);
        const criteria = evaluatedArgs[1];
        return rangeValues.filter((value) => compareValues(value, criteria) === 0).length;
      }

      const metricValues = getArgSeries(node.args[0]!, evaluatedArgs[0], context);
      const criteriaValues = getArgSeries(node.args[1]!, evaluatedArgs[1], context);
      const criteria = evaluatedArgs[2];
      const length = Math.min(metricValues.length, criteriaValues.length);
      const filteredMetrics: number[] = [];

      for (let index = 0; index < length; index += 1) {
        if (compareValues(criteriaValues[index], criteria) === 0) {
          filteredMetrics.push(toNumber(metricValues[index]));
        }
      }

      if (name === "SUMIF") return filteredMetrics.reduce((acc, value) => acc + value, 0);
      if (!filteredMetrics.length) return 0;
      return filteredMetrics.reduce((acc, value) => acc + value, 0) / filteredMetrics.length;
    }

    // Text functions
    if (name === "CONTAINS") {
      const [haystack, needle] = evaluatedArgs;
      return toString(haystack).includes(toString(needle));
    }
    if (name === "REPLACE") {
      const [input, start, count, replacement] = evaluatedArgs;
      const text = toString(input);
      const s = Math.max(0, Math.floor(toNumber(start)) - 1);
      const c = Math.max(0, Math.floor(toNumber(count)));
      return text.slice(0, s) + toString(replacement) + text.slice(s + c);
    }
    if (name === "PROPER") {
      return toString(evaluatedArgs[0]).replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (name === "EXACT") {
      return toString(evaluatedArgs[0]) === toString(evaluatedArgs[1]);
    }
    if (name === "REPT") {
      return toString(evaluatedArgs[0]).repeat(Math.max(0, Math.floor(toNumber(evaluatedArgs[1]))));
    }
    if (name === "CHAR") {
      return String.fromCharCode(Math.floor(toNumber(evaluatedArgs[0])));
    }
    if (name === "CODE") {
      return toString(evaluatedArgs[0]).charCodeAt(0) || 0;
    }
    if (name === "TEXTJOIN") {
      const delimiter = toString(evaluatedArgs[0]);
      const ignoreEmpty = evaluatedArgs.length > 1 ? isTruthy(evaluatedArgs[1]) : false;
      const items = evaluatedArgs.slice(2);
      return items.filter((v) => !ignoreEmpty || (v !== null && v !== undefined && toString(v).length > 0)).map(toString).join(delimiter);
    }
    if (name === "SPLIT") {
      const [input, delimiter] = evaluatedArgs;
      return toString(input).split(toString(delimiter));
    }

    // Error handling
    if (name === "ISBLANK") {
      const v = evaluatedArgs[0];
      return v === null || v === undefined || toString(v).trim() === "";
    }
    if (name === "ISNUMBER") {
      return typeof evaluatedArgs[0] === "number" && Number.isFinite(evaluatedArgs[0]);
    }
    if (name === "ISERROR") {
      return evaluatedArgs[0] instanceof Error;
    }
    if (name === "IFERROR") {
      return evaluatedArgs[0] instanceof Error ? evaluatedArgs[1] : evaluatedArgs[0];
    }

    // Math functions
    if (name === "SIGN") {
      const n = toNumber(evaluatedArgs[0]);
      return n > 0 ? 1 : n < 0 ? -1 : 0;
    }
    if (name === "EVEN") {
      return Math.ceil(toNumber(evaluatedArgs[0]) / 2) * 2;
    }
    if (name === "ODD") {
      const n = toNumber(evaluatedArgs[0]);
      return Math.ceil(Math.abs(n) / 2) * 2 - (n >= 0 ? 1 : -1);
    }
    if (name === "RANDBETWEEN") {
      const lo = Math.floor(toNumber(evaluatedArgs[0]));
      const hi = Math.floor(toNumber(evaluatedArgs[1]));
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    }
    if (name === "ROUNDUP") {
      const n = toNumber(evaluatedArgs[0]);
      const d = Math.floor(toNumber(evaluatedArgs[1]) || 0);
      const factor = Math.pow(10, d);
      return Math.ceil(n * factor) / factor;
    }
    if (name === "ROUNDDOWN") {
      const n = toNumber(evaluatedArgs[0]);
      const d = Math.floor(toNumber(evaluatedArgs[1]) || 0);
      const factor = Math.pow(10, d);
      return Math.floor(n * factor) / factor;
    }
    if (name === "TRUNC") {
      const n = toNumber(evaluatedArgs[0]);
      const d = Math.floor(toNumber(evaluatedArgs[1]) || 0);
      const factor = Math.pow(10, d);
      return Math.trunc(n * factor) / factor;
    }
    if (name === "LN") return Math.log(toNumber(evaluatedArgs[0]));
    if (name === "EXP") return Math.exp(toNumber(evaluatedArgs[0]));

    // Statistical functions
    if (name === "MEDIAN") {
      const values = flatten(evaluatedArgs).map(toNumber).filter(Number.isFinite).sort((a, b) => a - b);
      if (!values.length) return 0;
      const mid = Math.floor(values.length / 2);
      return values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    }
    if (name === "LARGE") {
      const values = flatten(evaluatedArgs).map(toNumber).filter(Number.isFinite).sort((a, b) => b - a);
      const k = Math.max(1, Math.floor(toNumber(evaluatedArgs[evaluatedArgs.length - 1] || 1)));
      return values[k - 1] || 0;
    }
    if (name === "SMALL") {
      const values = flatten(evaluatedArgs).map(toNumber).filter(Number.isFinite).sort((a, b) => a - b);
      const k = Math.max(1, Math.floor(toNumber(evaluatedArgs[evaluatedArgs.length - 1] || 1)));
      return values[k - 1] || 0;
    }
    if (name === "STDEV") {
      const values = flatten(evaluatedArgs).map(toNumber).filter(Number.isFinite);
      if (values.length < 2) return 0;
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1);
      return Math.sqrt(variance);
    }

    // Lookup functions
    if (name === "VLOOKUP") {
      const lookupVal = evaluatedArgs[0];
      const table = evaluatedArgs[1] as unknown[] | undefined;
      const colIdx = Math.max(1, Math.floor(toNumber(evaluatedArgs[2])));
      const exact = evaluatedArgs.length < 4 || isTruthy(evaluatedArgs[3]);
      if (!table || !Array.isArray(table)) return "#REF!";
      for (const row of table) {
        if (Array.isArray(row)) {
          if (exact ? compareValues(row[0], lookupVal) === 0 : toNumber(row[0]) <= toNumber(lookupVal)) {
            return row[colIdx - 1] ?? "#N/A";
          }
        }
      }
      return "#N/A";
    }
    if (name === "INDEX") {
      const table = evaluatedArgs[0] as unknown[] | undefined;
      const rowIdx = Math.max(1, Math.floor(toNumber(evaluatedArgs[1]))) - 1;
      const colIdx = evaluatedArgs.length > 2 ? Math.max(1, Math.floor(toNumber(evaluatedArgs[2]))) - 1 : 0;
      if (!table || !Array.isArray(table[rowIdx])) return "#REF!";
      return (table[rowIdx] as unknown[])[colIdx] ?? "#N/A";
    }
    if (name === "MATCH") {
      const lookupVal = evaluatedArgs[0];
      const range = (evaluatedArgs[1] as unknown[] || []).flat();
      const matchType = Math.floor(toNumber(evaluatedArgs[2] || 0));
      for (let i = 0; i < range.length; i++) {
        if (matchType === 0 && compareValues(range[i], lookupVal) === 0) return i + 1;
        if (matchType === -1 && toNumber(range[i]) >= toNumber(lookupVal)) return i + 1;
        if (matchType === 1 && toNumber(range[i]) <= toNumber(lookupVal)) return i + 1;
      }
      return "#N/A";
    }

    // Array helpers
    if (name === "UNIQUE") {
      const values = flatten(evaluatedArgs).map(toString);
      return [...new Set(values)];
    }
    if (name === "FILTER") {
      const arr = (evaluatedArgs[0] as unknown[]) || [];
      const include = (evaluatedArgs[1] as unknown[]) || [];
      return arr.filter((_, i) => isTruthy(include[i]));
    }
    if (name === "SORT") {
      const arr = [...((evaluatedArgs[0] as unknown[]) || [])];
      return arr.sort((a, b) => {
        const av = typeof a === 'number' && Number.isFinite(a) ? a : toString(a);
        const bv = typeof b === 'number' && Number.isFinite(b) ? b : toString(b);
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
    }

    if (AGGREGATE_FUNCTIONS.has(name)) {
      const aggregateValues = flatten(
        node.args.map((arg, index) => getArgSeries(arg, evaluatedArgs[index], context))
      );
      const numericValues = aggregateValues.map((entry) => toNumber(entry));

      if (name === "SUM") return numericValues.reduce((acc, entry) => acc + entry, 0);
      if (name === "AVG") {
        if (!numericValues.length) return 0;
        return numericValues.reduce((acc, entry) => acc + entry, 0) / numericValues.length;
      }
      if (name === "COUNT") {
        return aggregateValues.filter((entry) => {
          if (entry === null || entry === undefined) return false;
          if (typeof entry === "string") return entry.trim() !== "";
          if (Array.isArray(entry)) return entry.length > 0;
          return true;
        }).length;
      }
      if (name === "MIN") return numericValues.length ? Math.min(...numericValues) : 0;
      if (name === "MAX") return numericValues.length ? Math.max(...numericValues) : 0;
    }

    if (name === "BOARD_LOOKUP") {
      // TODO: cross-board lookup needs board/item relation traversal and access checks.
      return "TODO: BOARD_LOOKUP not implemented";
    }

    throw new Error(`Unsupported function: ${name}`);
  }

  return null;
}

function parseExpression(expression: string): ExprNode {
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  return parser.parseExpression();
}

export function evaluateFormulaExpression(expression: string, context: FormulaEvaluationContext = {}): unknown {
  const ast = parseExpression(expression);
  return evaluate(ast, context);
}

export function validateFormulaExpression(expression: string): { valid: boolean; error?: string } {
  try {
    parseExpression(expression);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Invalid formula",
    };
  }
}
