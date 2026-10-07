import { useState, type KeyboardEvent } from 'react';
import { Delete } from 'lucide-react';

import { calculate } from '@nexos/core';

import type { ApplicationProperties } from './registry';

const keys = [
  'C',
  '(',
  ')',
  '⌫',
  '7',
  '8',
  '9',
  '÷',
  '4',
  '5',
  '6',
  '×',
  '1',
  '2',
  '3',
  '−',
  '0',
  '.',
  '%',
  '+',
] as const;

export default function CalculatorApp(_properties: ApplicationProperties) {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('0');
  const [error, setError] = useState(false);

  const evaluate = () => {
    try {
      const value = calculate(
        expression.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-'),
      );
      setResult(String(Number(value.toPrecision(12))));
      setError(false);
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : 'Invalid expression');
      setError(true);
    }
  };

  const press = (key: string) => {
    if (key === 'C') {
      setExpression('');
      setResult('0');
      setError(false);
    } else if (key === '⌫') setExpression((current) => current.slice(0, -1));
    else setExpression((current) => `${current}${key}`);
  };

  const keyDown = (event: KeyboardEvent) => {
    if (/^[0-9.+\-*/%()]$/.test(event.key)) {
      event.preventDefault();
      setExpression((current) => `${current}${event.key}`);
    } else if (event.key === 'Enter' || event.key === '=') {
      event.preventDefault();
      evaluate();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      press('⌫');
    } else if (event.key === 'Escape') press('C');
  };

  return (
    <div className="calculator-app" tabIndex={0} onKeyDown={keyDown}>
      <div className="calculator-display">
        <span>{expression || '0'}</span>
        <strong className={error ? 'is-error' : ''}>{result}</strong>
      </div>
      <div className="calculator-keys">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={
              ['÷', '×', '−', '+'].includes(key) ? 'operator' : key === 'C' ? 'action' : ''
            }
            onClick={() => press(key)}
          >
            {key === '⌫' ? <Delete size={20} /> : key}
          </button>
        ))}
        <button type="button" className="equals" onClick={evaluate}>
          =
        </button>
      </div>
    </div>
  );
}
