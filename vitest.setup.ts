import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

// jsdom には Web Crypto の subtle が無いので Node の実装を割り当てる
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// jsdom は structuredClone を持たない場合がある（Dexie / fake-indexeddb が使用）
if (typeof globalThis.structuredClone !== 'function') {
  const { structuredClone: sc } = await import('node:worker_threads').then(() => ({
    structuredClone: (v: unknown) => JSON.parse(JSON.stringify(v)),
  }));
  Object.defineProperty(globalThis, 'structuredClone', { value: sc, configurable: true });
}

// jsdom の Blob には text()/arrayBuffer() が無いことがあるため Node の実装で補う
if (typeof Blob === 'undefined' || typeof Blob.prototype.text !== 'function') {
  const { Blob: NodeBlob, File: NodeFile } = await import('node:buffer');
  Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, configurable: true, writable: true });
  if (NodeFile) {
    Object.defineProperty(globalThis, 'File', { value: NodeFile, configurable: true, writable: true });
  }
}

// matchMedia (prefers-reduced-motion / color-scheme) のスタブ
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
