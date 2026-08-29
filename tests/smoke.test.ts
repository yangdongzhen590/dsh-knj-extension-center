import { describe, expect, it } from 'vitest';
import { name, inject } from '../src/index';

describe('plugin contract', () => {
  it('exports stable name and inject list', () => {
    expect(name).toBe('skill-center');
    expect(inject).toEqual(['webServer', 'skills', 'sessions']);
  });
});
