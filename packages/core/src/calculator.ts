import { NexOSError } from './errors.js';

type Token =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' };

const precedence: Readonly<Record<string, number>> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '%': 2,
  '^': 3,
};

function tokenize(expression: string): Token[] {
  const result: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const character = expression[index];
    if (character === undefined) break;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    const previous = result.at(-1);
    const unary =
      character === '-' &&
      (!previous ||
        previous.type === 'operator' ||
        (previous.type === 'paren' && previous.value === '('));
    if (/\d|\./.test(character) || unary) {
      const match = expression
        .slice(index)
        .match(unary ? /^-?(?:\d+(?:\.\d*)?|\.\d+)/ : /^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match)
        throw new NexOSError('INVALID_INPUT', `Invalid number near “${expression.slice(index)}”.`);
      const value = Number(match[0]);
      if (!Number.isFinite(value))
        throw new NexOSError('INVALID_INPUT', 'The number is outside the supported range.');
      result.push({ type: 'number', value });
      index += match[0].length;
      continue;
    }
    if (character in precedence) {
      result.push({ type: 'operator', value: character });
      index += 1;
      continue;
    }
    if (character === '(' || character === ')') {
      result.push({ type: 'paren', value: character });
      index += 1;
      continue;
    }
    throw new NexOSError('INVALID_INPUT', `Unsupported calculator character: ${character}`);
  }
  return result;
}

export function calculate(expression: string): number {
  if (expression.trim().length === 0) return 0;
  const output: Token[] = [];
  const operators: Token[] = [];
  for (const token of tokenize(expression)) {
    if (token.type === 'number') {
      output.push(token);
      continue;
    }
    if (token.type === 'paren' && token.value === '(') {
      operators.push(token);
      continue;
    }
    if (token.type === 'paren' && token.value === ')') {
      while (operators.length > 0 && operators.at(-1)?.type !== 'paren') {
        output.push(operators.pop()!);
      }
      if (operators.pop()?.type !== 'paren')
        throw new NexOSError('INVALID_INPUT', 'Unbalanced parentheses.');
      continue;
    }
    if (token.type === 'operator') {
      while (true) {
        const top = operators.at(-1);
        if (!top || top.type !== 'operator') break;
        const leftAssociative = token.value !== '^';
        if ((precedence[top.value] ?? 0) < (precedence[token.value] ?? 0)) break;
        if (!leftAssociative && precedence[top.value] === precedence[token.value]) break;
        output.push(operators.pop()!);
      }
      operators.push(token);
    }
  }
  while (operators.length > 0) {
    const token = operators.pop()!;
    if (token.type === 'paren') throw new NexOSError('INVALID_INPUT', 'Unbalanced parentheses.');
    output.push(token);
  }

  const stack: number[] = [];
  for (const token of output) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }
    if (token.type !== 'operator') continue;
    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined)
      throw new NexOSError('INVALID_INPUT', 'Incomplete expression.');
    let value: number;
    switch (token.value) {
      case '+':
        value = left + right;
        break;
      case '-':
        value = left - right;
        break;
      case '*':
        value = left * right;
        break;
      case '/':
        if (right === 0) throw new NexOSError('INVALID_INPUT', 'Division by zero is undefined.');
        value = left / right;
        break;
      case '%':
        value = left % right;
        break;
      case '^':
        value = left ** right;
        break;
      default:
        throw new NexOSError('INVALID_INPUT', `Unknown operator ${token.value}.`);
    }
    if (!Number.isFinite(value))
      throw new NexOSError('INVALID_INPUT', 'The result is outside the supported range.');
    stack.push(value);
  }
  if (stack.length !== 1) throw new NexOSError('INVALID_INPUT', 'Invalid expression.');
  return stack[0]!;
}
