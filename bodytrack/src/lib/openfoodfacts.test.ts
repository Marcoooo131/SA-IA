import { describe, expect, it } from 'vitest';
import { mapProduct } from './openfoodfacts';

describe('Open Food Facts', () => {
  it('reprend les valeurs pour 100 g sans les modifier', () => {
    const r = mapProduct({ code: '123', product_name: 'Skyr', brands: 'Marque, Autre', quantity: '450 g', nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 } })!;
    expect(r.complete).toBe(true);
    expect(r.food).toMatchObject({ name: 'Skyr', brand: 'Marque', unit: 'g', kcal100: 63, protein100: 11, carbs100: 4, fat100: 0.2, barcode: '123' });
  });
  it('signale les valeurs manquantes au lieu de les inventer', () => {
    const r = mapProduct({ code: '1', product_name: 'Barre', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 20 } })!;
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['glucides', 'lipides']);
  });
  it('convertit uniquement les kJ en kcal', () => {
    const r = mapProduct({ code: '2', product_name: 'Jus', quantity: '1 L', nutriments: { 'energy-kj_100g': 188, proteins_100g: 0.5, carbohydrates_100g: 10, fat_100g: 0 } })!;
    expect(r.food.kcal100).toBeCloseTo(44.9, 1);
    expect(r.food.unit).toBe('ml');
  });
  it('produit sans nom ignoré', () => {
    expect(mapProduct({ code: '3', nutriments: {} })).toBeNull();
  });
});
