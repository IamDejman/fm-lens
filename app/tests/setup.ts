import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
Object.defineProperty(window, 'matchMedia', { value: vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) });
HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.scrollTo = vi.fn();
HTMLElement.prototype.getClientRects = function () { return [{ width: 100, height: 30 }] as unknown as DOMRectList; };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
