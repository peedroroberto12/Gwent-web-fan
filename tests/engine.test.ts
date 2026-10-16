import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/engine';

describe('ambiente', () => {
  it('carrega o motor', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
