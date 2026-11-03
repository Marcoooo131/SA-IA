import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Heart, History, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import type { Meal, MealItem, MealType } from '../../lib/types';
import { Button, Card, Field, IconButton, MacroBar, PageHeader, Ring, Sheet, SubNav, cx } from '../../components/ui';
import { useCtx, useToday } from '../../lib/useCtx';
import { MEAL_TYPES, mealLabel, nutrientsFor, roundNutrients, sumItems } from '../../lib/calc/nutrition';
import { addFoodToMeal, copyMealItems, deleteMeal, saveMealAsFavorite } from '../../lib/actions';
import { addDays, formatLongDate } from '../../lib/dates';
import { fmt, fmtSmart } from '../../lib/format';
import { store } from '../../lib/store/store';
import { FoodPicker, QuantityStep } from './FoodPicker';
import { toast } from '../../components/toast';
import { confirmDialog } from '../../components/confirm';
import { queryParam, usePath } from '../../lib/router';

export const NUTRITION_NAV = [
  { to: '/nutrition', label: 'Journal' },
  { to: '/nutrition/goals', label: 'Objectifs' },
  { to: '/nutrition/trends', label: 'Tendances' },
  { to: '/nutrition/simulator', label: 'Simulateur' },
];

export default function NutritionJournal() {
  const ctx = useCtx();
  const t = useToday();
  const path = usePath();
  const [date, setDate] = useState(queryParam(path, 'date') ?? t);
  const [adding, setAdding] = useState<MealType | null>(null);
  const [editItem, setEditItem] = useState<MealItem | null>(null);
  const [mealMenu, setMealMenu] = useState<MealType | null>(null);
  const goal = ctx.goalOn(date);
  const totals = ctx.dayTotals(date);
  const meals = ctx.mealsByDate.get(date) ?? [];

  return (
    <div>
      <PageHeader title="Nutrition" subtitle="Journal alimentaire" />
      <SubNav items={NUTRITION_NAV} active="/nutrition" />

      <div className="flex items-center justify-between mb-4">
        <IconButton label="Jour précédent" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
        <button type="button" className="text-center" onClick={() => setDate(t)}>
          <div className="text-sm font-semibold first-letter:uppercase">{date === t ? "Aujourd'hui" : formatLongDate(date)}</div>
          {date !== t && <div className="text-[11px] text-accent">Revenir à aujourd'hui</div>}
        </button>
        <IconButton label="Jour suivant" onClick={() => setDate(addDays(date, 1))} disabled={date >= addDays(t, 7)}>
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <Card className="mb-5">
        {goal ? (
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <Ring value={totals.kcal} max={goal.calories} size={148} stroke={12}>
              <div>
                <div className="display text-4xl font-bold tnum leading-none">{fmt(Math.max(0, goal.calories - totals.kcal))}</div>
                <div className="text-[11px] text-muted mt-1">{goal.calories - totals.kcal >= 0 ? 'kcal restantes' : `kcal au-dessus (+${fmt(totals.kcal - goal.calories)})`}</div>
                <div className="text-[11px] text-faint tnum">
                  {fmt(totals.kcal)} / {fmt(goal.calories)}
                </div>
              </div>
            </Ring>
            <div className="flex-1 w-full space-y-3">
              <MacroBar label="Protéines" value={totals.protein} target={goal.proteinG} color="var(--color-protein)" />
              <MacroBar label="Glucides" value={totals.carbs} target={goal.carbsG} color="var(--color-carbs)" />
              <MacroBar label="Lipides" value={totals.fat} target={goal.fatG} color="var(--color-fat)" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucun objectif défini. <a className="text-accent" href="#/nutrition/goals">Configurer mes objectifs</a></p>
        )}
        <p className="text-[11px] text-faint mt-3">Calories estimées à partir des valeurs de référence des aliments : ce ne sont pas des mesures exactes.</p>
      </Card>

      <div className="space-y-3">
        {MEAL_TYPES.map(({ value }) => {
          const meal = meals.find((m) => m.mealType === value);
          const items = meal ? (ctx.itemsByMeal.get(meal.id) ?? []) : [];
          const n = roundNutrients(sumItems(items));
          return (
            <Card key={value} className="!p-0 overflow-hidden">
              <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{mealLabel(value)}</div>
                  <div className="text-xs text-muted tnum">{items.length ? `${fmt(n.kcal)} kcal · P ${fmtSmart(n.protein)} · G ${fmtSmart(n.carbs)} · L ${fmtSmart(n.fat)}` : 'Rien de saisi'}</div>
                </div>
                <IconButton label={`Options ${mealLabel(value)}`} onClick={() => setMealMenu(value)}>
                  <MoreHorizontal size={18} />
                </IconButton>
                <Button size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => setAdding(value)}>
                  Ajouter
                </Button>
              </div>
              {items.length > 0 && (
                <ul className="border-t border-line divide-y divide-line">
                  {items.map((it) => {
                    const v = roundNutrients(nutrientsFor(it, it.quantity));
                    return (
                      <li key={it.id}>
                        <button type="button" onClick={() => setEditItem(it)} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm truncate">{it.name}</span>
                            <span className="block text-xs text-muted tnum">
                              {fmtSmart(it.quantity, 1)} {it.unit} · P {fmtSmart(v.protein)} · G {fmtSmart(v.carbs)} · L {fmtSmart(v.fat)}
                            </span>
                          </span>
                          <span className="text-sm font-semibold tnum">{fmt(v.kcal)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <FoodPicker
        open={!!adding}
        onClose={() => setAdding(null)}
        title={adding ? `Ajouter au ${mealLabel(adding).toLowerCase()}` : ''}
        onAdd={(food, q) => {
          addFoodToMeal(date, adding!, food, q);
          toast('Aliment ajouté', `${food.name} · ${fmtSmart(q, 1)} ${food.unit}`);
          setAdding(null);
        }}
      />

      <Sheet open={!!editItem} onClose={() => setEditItem(null)} title="Modifier la quantité">
        {editItem && (
          <div>
            <QuantityStep
              food={editItem}
              initial={editItem.quantity}
              confirmLabel="Enregistrer"
              onConfirm={(q) => {
                store().upsert('mealItems', { ...editItem, quantity: q });
                setEditItem(null);
              }}
            />
            <div className="border-t border-line mt-5 pt-4">
              <Button
                variant="danger"
                className="w-full"
                icon={<Trash2 size={14} />}
                onClick={() => {
                  store().remove('mealItems', editItem.id);
                  setEditItem(null);
                  toast('Aliment supprimé');
                }}
              >
                Supprimer cet aliment
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {mealMenu && <MealMenu date={date} mealType={mealMenu} meal={meals.find((m) => m.mealType === mealMenu) ?? null} onClose={() => setMealMenu(null)} />}
    </div>
  );
}

function MealMenu({ date, mealType, meal, onClose }: { date: string; mealType: MealType; meal: Meal | null; onClose: () => void }) {
  const ctx = useCtx();
  const [view, setView] = useState<'menu' | 'fav' | 'save' | 'dup' | 'prev'>('menu');
  const [favName, setFavName] = useState(`${mealLabel(mealType)} favori`);
  const [dupDate, setDupDate] = useState(addDays(date, 1));
  const [dupType, setDupType] = useState<MealType>(mealType);
  const items = meal ? (ctx.itemsByMeal.get(meal.id) ?? []) : [];
  // Repas précédents du même type (14 derniers jours)
  const previous = Array.from({ length: 14 }, (_, i) => addDays(date, -(i + 1)))
    .map((d) => ({ d, m: (ctx.mealsByDate.get(d) ?? []).find((x) => x.mealType === mealType) }))
    .filter((x) => x.m && (ctx.itemsByMeal.get(x.m.id) ?? []).length);

  return (
    <Sheet open onClose={onClose} title={mealLabel(mealType)}>
      {view === 'menu' && (
        <div className="grid gap-2">
          <Button className="justify-start" icon={<History size={16} />} onClick={() => setView('prev')} disabled={!previous.length}>
            Réutiliser un repas précédent
          </Button>
          <Button className="justify-start" icon={<Star size={16} />} onClick={() => setView('fav')} disabled={!ctx.favorites.length}>
            Ajouter un repas favori
          </Button>
          <Button className="justify-start" icon={<Heart size={16} />} onClick={() => setView('save')} disabled={!items.length}>
            Enregistrer comme favori
          </Button>
          <Button className="justify-start" icon={<Copy size={16} />} onClick={() => setView('dup')} disabled={!items.length}>
            Dupliquer ce repas
          </Button>
          <Button
            variant="danger"
            className="justify-start"
            icon={<Trash2 size={16} />}
            disabled={!items.length}
            onClick={async () => {
              if (meal && (await confirmDialog({ title: 'Vider ce repas ?', text: `${items.length} aliment(s) seront supprimés.`, confirmLabel: 'Vider', danger: true }))) {
                deleteMeal(meal.id);
                onClose();
              }
            }}
          >
            Vider le repas
          </Button>
        </div>
      )}
      {view === 'prev' && (
        <ul className="divide-y divide-line">
          {previous.map(({ d, m }) => {
            const its = ctx.itemsByMeal.get(m!.id) ?? [];
            return (
              <li key={d}>
                <button
                  type="button"
                  className="w-full text-left py-3"
                  onClick={() => {
                    const n = copyMealItems(m!.id, date, mealType);
                    toast('Repas copié', `${n} aliment(s)`);
                    onClose();
                  }}
                >
                  <div className="text-sm font-medium first-letter:uppercase">{formatLongDate(d)}</div>
                  <div className="text-xs text-muted truncate">
                    {fmt(sumItems(its).kcal)} kcal · {its.map((i) => i.name).join(', ')}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {view === 'fav' && (
        <ul className="divide-y divide-line">
          {ctx.favorites.map((f) => {
            const its = ctx.itemsByMeal.get(f.id) ?? [];
            return (
              <li key={f.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 text-left py-3 min-w-0"
                  onClick={() => {
                    const n = copyMealItems(f.id, date, mealType);
                    toast('Favori ajouté', `${n} aliment(s)`);
                    onClose();
                  }}
                >
                  <div className="text-sm font-medium">{f.favoriteName}</div>
                  <div className="text-xs text-muted truncate">
                    {fmt(sumItems(its).kcal)} kcal · {its.map((i) => i.name).join(', ')}
                  </div>
                </button>
                <IconButton
                  label="Supprimer le favori"
                  onClick={async () => {
                    if (await confirmDialog({ title: `Supprimer « ${f.favoriteName} » ?`, confirmLabel: 'Supprimer', danger: true })) deleteMeal(f.id);
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {view === 'save' && meal && (
        <div className="space-y-4">
          <Field label="Nom du favori">
            <input className="field" value={favName} onChange={(e) => setFavName(e.target.value)} maxLength={50} autoFocus />
          </Field>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              saveMealAsFavorite(meal.id, favName);
              toast('Favori enregistré', favName);
              onClose();
            }}
          >
            Enregistrer
          </Button>
        </div>
      )}
      {view === 'dup' && meal && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className="field" value={dupDate} onChange={(e) => setDupDate(e.target.value)} />
            </Field>
            <Field label="Repas">
              <select className="field" value={dupType} onChange={(e) => setDupType(e.target.value as MealType)}>
                {MEAL_TYPES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex gap-2">
            {[0, 1].map((o) => (
              <button key={o} type="button" onClick={() => setDupDate(addDays(date, o))} className={cx('rounded-full px-3 py-1 text-xs border', dupDate === addDays(date, o) ? 'border-accent text-accent' : 'border-line text-muted')}>
                {o === 0 ? 'Même jour' : 'Lendemain'}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              const n = copyMealItems(meal.id, dupDate, dupType);
              toast('Repas dupliqué', `${n} aliment(s) → ${mealLabel(dupType).toLowerCase()} du ${formatLongDate(dupDate)}`);
              onClose();
            }}
          >
            Dupliquer
          </Button>
        </div>
      )}
    </Sheet>
  );
}
