import assert from 'node:assert';
import { describe, it } from 'node:test';

import {
  dedupePlaces,
  getCountryFromComponents,
  haversineDistanceKm,
  normalizeNumber,
} from '../server.js';

describe('normalizeNumber', () => {
  it('returns numbers for numeric strings', () => {
    assert.strictEqual(normalizeNumber('42.5'), 42.5);
    assert.strictEqual(normalizeNumber(10), 10);
  });

  it('returns null for invalid inputs', () => {
    assert.strictEqual(normalizeNumber('abc'), null);
    assert.strictEqual(normalizeNumber(undefined), null);
  });
});

describe('haversineDistanceKm', () => {
  it('calculates distance between two coordinates', () => {
    const newYork = { latitude: 40.7128, longitude: -74.006 };
    const london = { latitude: 51.5074, longitude: -0.1278 };

    const distance = haversineDistanceKm(newYork, london);

    assert.ok(distance > 5500 && distance < 5600);
  });
});

describe('dedupePlaces', () => {
  it('removes near-duplicate places and those matching the source', () => {
    const origin = { latitude: 37.5665, longitude: 126.978 }; // Seoul
    const list = [
      { latitude: 37.5665, longitude: 126.978, name: 'Same spot' },
      { latitude: 37.57, longitude: 126.98, name: 'Duplicate rounded' },
      { latitude: 35.1796, longitude: 129.0756, name: 'Busan' },
      { latitude: 35.1797, longitude: 129.0757, name: 'Busan close' },
    ];

    const deduped = dedupePlaces(list, origin);
    assert.deepStrictEqual(
      deduped.map((item) => item.name),
      ['Busan']
    );
  });
});

describe('getCountryFromComponents', () => {
  it('prefers long_name over short_name', () => {
    const components = [
      { long_name: 'Korea', short_name: 'KR', types: ['country'] },
    ];

    assert.strictEqual(getCountryFromComponents(components), 'Korea');
  });

  it('falls back to short_name', () => {
    const components = [
      { short_name: 'FR', types: ['country'] },
    ];

    assert.strictEqual(getCountryFromComponents(components), 'FR');
  });

  it('returns Unknown when no country component exists', () => {
    const components = [{ long_name: 'Seoul', types: ['locality'] }];
    assert.strictEqual(getCountryFromComponents(components), 'Unknown');
  });
});
