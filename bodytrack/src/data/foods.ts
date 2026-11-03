import type { Food, FoodUnit } from '../lib/types';

/**
 * Base alimentaire de départ : valeurs MOYENNES pour 100 g (ou 100 ml), arrondies,
 * établies à partir des tables de composition de référence (Ciqual – Anses, USDA FoodData Central).
 * Les glucides sont les glucides disponibles (hors fibres), comme sur les étiquettes européennes.
 * Les valeurs d'un produit précis peuvent différer : vérifie l'étiquette.
 */
type Def = [id: string, name: string, category: string, kcal: number, p: number, c: number, f: number, serving?: number, servingLabel?: string, unit?: FoodUnit];

const DEFS: Def[] = [
  // Féculents
  ['rice-cooked', 'Riz blanc cuit', 'Féculents', 130, 2.7, 28.2, 0.3, 150, '1 assiette'],
  ['rice-raw', 'Riz blanc cru', 'Féculents', 357, 7, 79, 0.6, 75, '1 portion crue'],
  ['brown-rice-cooked', 'Riz complet cuit', 'Féculents', 123, 2.7, 25.6, 1, 150, '1 assiette'],
  ['pasta-cooked', 'Pâtes cuites', 'Féculents', 157, 5.8, 30.6, 0.9, 200, '1 assiette'],
  ['pasta-raw', 'Pâtes crues', 'Féculents', 359, 12.5, 71, 1.5, 90, '1 portion crue'],
  ['oats', "Flocons d'avoine", 'Féculents', 367, 13.5, 58.7, 7, 60, '1 bol'],
  ['wholemeal-bread', 'Pain complet', 'Féculents', 240, 9, 41, 3.3, 40, '1 tranche épaisse'],
  ['baguette', 'Baguette (pain blanc)', 'Féculents', 270, 9, 55, 1.3, 50, '1/5 de baguette'],
  ['potato-boiled', "Pommes de terre cuites à l'eau", 'Féculents', 80, 1.9, 17, 0.1, 200, '1 portion'],
  ['sweet-potato', 'Patate douce cuite', 'Féculents', 90, 2, 17.5, 0.2, 200, '1 portion'],
  ['quinoa-cooked', 'Quinoa cuit', 'Féculents', 120, 4.4, 19.4, 1.9, 150, '1 portion'],
  ['semolina-cooked', 'Semoule de blé cuite', 'Féculents', 112, 3.8, 23, 0.2, 150, '1 portion'],
  ['rice-cakes', 'Galettes de riz soufflé', 'Féculents', 387, 8, 81, 2.8, 9, '1 galette'],
  ['lentils-cooked', 'Lentilles cuites', 'Légumineuses', 116, 9, 16.5, 0.4, 150, '1 portion'],
  ['chickpeas-cooked', 'Pois chiches cuits', 'Légumineuses', 140, 8.4, 19, 2.6, 150, '1 portion'],
  // Viandes & poissons
  ['chicken-breast-raw', 'Blanc de poulet cru', 'Viandes', 120, 22.5, 0, 2.6, 150, '1 filet'],
  ['chicken-breast-cooked', 'Blanc de poulet cuit', 'Viandes', 165, 31, 0, 3.6, 120, '1 filet cuit'],
  ['turkey-raw', 'Escalope de dinde crue', 'Viandes', 105, 23, 0, 1.4, 130, '1 escalope'],
  ['ground-beef-5', 'Steak haché 5 % MG cru', 'Viandes', 126, 20.5, 0, 5, 100, '1 steak'],
  ['ground-beef-15', 'Steak haché 15 % MG cru', 'Viandes', 210, 18.5, 0, 15, 100, '1 steak'],
  ['beef-rump', 'Rumsteck de bœuf cru', 'Viandes', 128, 22, 0, 4.5, 150, '1 pièce'],
  ['ham', 'Jambon blanc', 'Viandes', 115, 21, 1, 3, 40, '1 tranche'],
  ['salmon-raw', 'Saumon cru', 'Poissons', 208, 20.4, 0, 13.4, 125, '1 pavé'],
  ['cod-raw', 'Cabillaud cru', 'Poissons', 82, 18, 0, 0.7, 150, '1 filet'],
  ['tuna-canned', 'Thon au naturel égoutté', 'Poissons', 116, 26, 0, 1, 100, '1 petite boîte'],
  ['sardines-oil', "Sardines à l'huile égouttées", 'Poissons', 208, 25, 0, 12, 85, '1 boîte égouttée'],
  ['shrimp-cooked', 'Crevettes cuites décortiquées', 'Poissons', 99, 24, 0, 0.3, 100, '1 portion'],
  // Œufs & laitiers
  ['egg', 'Œuf entier', 'Œufs & laitiers', 143, 12.6, 0.7, 9.5, 55, '1 œuf moyen'],
  ['egg-white', "Blanc d'œuf", 'Œufs & laitiers', 52, 10.9, 0.7, 0.2, 33, '1 blanc'],
  ['skyr', 'Skyr nature', 'Œufs & laitiers', 63, 11, 4, 0.2, 150, '1 pot'],
  ['fromage-blanc-0', 'Fromage blanc 0 %', 'Œufs & laitiers', 47, 7.5, 4, 0.2, 100, '1 portion'],
  ['fromage-blanc-3', 'Fromage blanc 3 %', 'Œufs & laitiers', 74, 7, 3.8, 3.2, 100, '1 portion'],
  ['cottage', 'Cottage cheese', 'Œufs & laitiers', 98, 11, 3.4, 4.3, 100, '1 portion'],
  ['milk-semi', 'Lait demi-écrémé', 'Œufs & laitiers', 46, 3.2, 4.8, 1.6, 250, '1 verre', 'ml'],
  ['emmental', 'Emmental', 'Œufs & laitiers', 375, 28, 0, 29, 30, '1 portion'],
  ['mozzarella', 'Mozzarella', 'Œufs & laitiers', 251, 18, 1, 19.5, 125, '1 boule'],
  ['whey', 'Whey protéine (moyenne)', 'Compléments', 385, 78, 6, 5.5, 30, '1 dose'],
  ['tofu', 'Tofu nature', 'Légumineuses', 122, 12.5, 1.5, 7.3, 100, '1 portion'],
  // Fruits
  ['banana', 'Banane', 'Fruits', 90, 1.1, 19.7, 0.3, 120, '1 banane'],
  ['apple', 'Pomme', 'Fruits', 53, 0.3, 11.6, 0.2, 150, '1 pomme'],
  ['orange', 'Orange', 'Fruits', 47, 0.9, 9.4, 0.1, 150, '1 orange'],
  ['strawberries', 'Fraises', 'Fruits', 32, 0.7, 6, 0.3, 150, '1 barquette'],
  ['blueberries', 'Myrtilles', 'Fruits', 57, 0.7, 12, 0.3, 100, '1 portion'],
  ['avocado', 'Avocat', 'Fruits', 155, 2, 2, 15, 100, '1/2 avocat'],
  ['orange-juice', "Jus d'orange", 'Boissons', 45, 0.7, 10, 0.2, 200, '1 verre', 'ml'],
  // Légumes
  ['broccoli', 'Brocoli cuit', 'Légumes', 35, 2.4, 4.4, 0.4, 150, '1 portion'],
  ['green-beans', 'Haricots verts cuits', 'Légumes', 28, 1.8, 4.3, 0.2, 150, '1 portion'],
  ['zucchini', 'Courgette', 'Légumes', 17, 1.2, 2.1, 0.3, 150, '1 portion'],
  ['tomato', 'Tomate', 'Légumes', 18, 0.9, 2.6, 0.2, 120, '1 tomate'],
  ['carrot', 'Carotte crue', 'Légumes', 36, 0.8, 7, 0.2, 100, '1 carotte'],
  ['salad', 'Salade verte', 'Légumes', 15, 1.3, 1.7, 0.2, 50, '1 bol'],
  ['spinach', 'Épinards cuits', 'Légumes', 23, 2.9, 1.2, 0.3, 150, '1 portion'],
  ['mixed-veg', 'Légumes mélangés surgelés cuits', 'Légumes', 45, 2.5, 6.5, 0.5, 200, '1 portion'],
  // Matières grasses & oléagineux
  ['almonds', 'Amandes', 'Oléagineux', 600, 21.4, 8.8, 52, 30, '1 poignée'],
  ['walnuts', 'Noix', 'Oléagineux', 680, 15, 7, 65, 30, '1 poignée'],
  ['peanut-butter', 'Beurre de cacahuète', 'Oléagineux', 600, 24, 14, 50, 15, '1 cuillère à soupe'],
  ['olive-oil', "Huile d'olive", 'Matières grasses', 900, 0, 0, 100, 10, '1 cuillère à soupe'],
  ['butter', 'Beurre', 'Matières grasses', 745, 0.7, 0.6, 82, 10, '1 noisette'],
  // Divers
  ['honey', 'Miel', 'Sucré', 304, 0.3, 82, 0, 15, '1 cuillère à soupe'],
  ['dark-chocolate', 'Chocolat noir 70 %', 'Sucré', 570, 8, 34, 42, 20, '2 carrés'],
];

export const BUILTIN_FOODS: Food[] = DEFS.map(([id, name, category, kcal, p, c, f, serving, servingLabel, unit]) => ({
  id: `food-${id}`,
  name,
  brand: '',
  unit: unit ?? 'g',
  kcal100: kcal,
  protein100: p,
  carbs100: c,
  fat100: f,
  servingSize: serving ?? null,
  servingLabel: servingLabel ?? '',
  category,
  source: 'builtin',
  barcode: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
}));
