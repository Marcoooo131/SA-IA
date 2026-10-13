import type { ProductCategory } from '@/domain/types';

/**
 * Représentations GÉNÉRIQUES des équipements (dessins vectoriels simples, blanc cassé),
 * destinées à reconnaître la catégorie d'un produit. Ce ne sont pas des visuels officiels :
 * les remplacer par les photos produit autorisées lorsqu'elles seront fournies.
 */
const BODY = '#fbfbfa';
const EDGE = '#d4d4d4';
const DARK = '#3a3a3a';

export function ProductArt({ category, size = 56 }: { category: ProductCategory; size?: number }) {
  const shadow = <ellipse cx={32} cy={58} rx={16} ry={2.2} fill="#000" opacity={0.08} />;
  let body: React.ReactNode;
  switch (category) {
    case 'detecteur_mouvement':
      body = (
        <>
          <rect x={22} y={8} width={20} height={46} rx={8} fill={BODY} stroke={EDGE} />
          <circle cx={32} cy={15} r={1.4} fill="#84cc16" />
          <circle cx={32} cy={23} r={4} fill={DARK} />
          <circle cx={32} cy={23} r={1.6} fill="#9ca3af" />
          <rect x={25} y={40} width={14} height={10} rx={4} fill="#ececec" stroke={EDGE} />
        </>
      );
      break;
    case 'detecteur_choc':
      body = (
        <>
          <rect x={22} y={8} width={9} height={46} rx={2.5} fill={BODY} stroke={EDGE} />
          <rect x={36} y={36} width={6} height={18} rx={2} fill={BODY} stroke={EDGE} />
        </>
      );
      break;
    case 'detecteur_fumee':
      body = (
        <>
          <circle cx={32} cy={32} r={21} fill={BODY} stroke={EDGE} />
          <circle cx={32} cy={32} r={15} fill="none" stroke="#ececec" strokeWidth={2} />
          <circle cx={32} cy={32} r={6.5} fill={BODY} stroke={EDGE} />
        </>
      );
      break;
    case 'clavier':
      body = (
        <>
          <rect x={18} y={10} width={28} height={42} rx={5} fill={BODY} stroke={EDGE} />
          <rect x={22} y={14} width={20} height={6} rx={1.5} fill="#e5e5e5" />
          {[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={23 + c * 6.5} y={24 + r * 6.5} width={4.5} height={4.5} rx={1} fill="#d4d4d4" />))}
        </>
      );
      break;
    case 'centrale':
      body = (
        <>
          <rect x={10} y={16} width={44} height={32} rx={7} fill={BODY} stroke={EDGE} />
          <circle cx={32} cy={32} r={6} fill="none" stroke="#d4d4d4" strokeWidth={2} />
          <circle cx={46} cy={24} r={1.4} fill="#84cc16" />
        </>
      );
      break;
    case 'boitier_save':
      body = (
        <>
          <rect x={8} y={18} width={48} height={30} rx={5} fill={BODY} stroke={EDGE} />
          {Array.from({ length: 6 }, (_, r) =>
            Array.from({ length: 12 }, (_, c) => <circle key={`${r}-${c}`} cx={13 + c * 3.5} cy={23 + r * 4} r={0.6} fill="#c4c4c4" />),
          )}
          <circle cx={32} cy={33} r={7} fill="#6b7280" opacity={0.55} />
        </>
      );
      break;
    case 'sirene_interieure':
      body = (
        <>
          <rect x={16} y={14} width={32} height={34} rx={9} fill={BODY} stroke={EDGE} />
          {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => <circle key={`${r}${c}`} cx={26 + c * 4} cy={25 + r * 4} r={0.8} fill="#a3a3a3" />))}
        </>
      );
      break;
    case 'sirene_exterieure':
      body = (
        <>
          <rect x={16} y={10} width={32} height={42} rx={6} fill={BODY} stroke={EDGE} />
          <rect x={20} y={14} width={24} height={9} rx={3} fill="#d7001e" opacity={0.75} />
          <rect x={22} y={30} width={20} height={16} rx={3} fill="#efefef" />
        </>
      );
      break;
    default:
      body = <rect x={16} y={14} width={32} height={34} rx={6} fill={BODY} stroke={EDGE} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      {shadow}
      {body}
    </svg>
  );
}
