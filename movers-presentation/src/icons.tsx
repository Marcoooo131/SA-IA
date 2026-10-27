import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarX,
  CircleCheck,
  ClipboardList,
  Eye,
  FileExclamationPoint,
  FileX,
  FolderSync,
  Handshake,
  Headset,
  Hourglass,
  Inbox,
  Layers,
  ListChecks,
  MessageCircle,
  MessageCircleX,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldCheck,
  Sparkles,
  Truck,
  UserCheck,
  UserCog,
  type LucideIcon,
} from 'lucide-react';

// Les noms d'icônes sont stockés en texte dans content.ts (partagé avec le générateur PowerPoint).
const icons: Record<string, LucideIcon> = {
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarX,
  CircleCheck,
  ClipboardList,
  Eye,
  FileExclamationPoint,
  FileX,
  FolderSync,
  Handshake,
  Headset,
  Hourglass,
  Inbox,
  Layers,
  ListChecks,
  MessageCircle,
  MessageCircleX,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldCheck,
  Sparkles,
  Truck,
  UserCheck,
  UserCog,
};

export function Icon({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const Component = icons[name];
  if (!Component) throw new Error(`Icône inconnue : ${name}`);
  return <Component size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}
