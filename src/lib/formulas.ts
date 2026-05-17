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
    if (name === "FORMAT_DATE") {
      const date = toDate(evaluatedArgs[0]);
      const format = toString(evaluatedArgs[1] ?? "YYYY-MM-DD");
      if (!date) return "";
      return formatDate(date, format);
    }

    if (AGGREGATE_FUNCTIONS.has(name)) {
      const aggregateValues = flatten(
        node.args.map((arg) => {
          if (arg.type === "column_ref") {
            const boardValues = resolveBoardValues(context, arg.key);
            if (boardValues.length > 0) return boardValues;
            return [resolveCurrentValue(context, arg.key)];
          }
          return [evaluate(arg, context)];
        })
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
