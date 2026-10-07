// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BootScreen } from './BootScreen';

describe('BootScreen', () => {
  it('exposes actual boot progress accessibly', () => {
    render(
      <BootScreen
        progress={{ stage: 'filesystem', label: 'Mounting virtual filesystem…', progress: 55 }}
      />,
    );

    expect(screen.getByText('Mounting virtual filesystem…')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('55');
  });
});
