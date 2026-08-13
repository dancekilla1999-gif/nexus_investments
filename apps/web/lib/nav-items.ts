import {
  LayoutDashboard,
  Wallet,
  LineChart,
  Users,
  TrendingUp,
  Sparkles,
  PieChart,
  ListOrdered,
  Receipt,
  CreditCard,
  ShieldCheck,
  UserCircle,
  Landmark,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Milestone tag shown as a small badge when the section isn't live yet. `null` = live now. */
  milestone: string | null;
}

export const primaryNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, milestone: null },
  { label: 'Wallet', href: '/wallet', icon: Wallet, milestone: 'MVP2' },
  { label: 'Trading Terminal', href: '/trading', icon: LineChart, milestone: 'MVP4' },
  { label: 'P2P', href: '/p2p', icon: Users, milestone: 'MVP5' },
  { label: 'Markets', href: '/markets', icon: TrendingUp, milestone: 'MVP4' },
  { label: 'AI Signals', href: '/signals', icon: Sparkles, milestone: 'MVP6' },
  { label: 'Portfolio', href: '/portfolio', icon: PieChart, milestone: 'MVP2' },
  { label: 'Orders', href: '/orders', icon: ListOrdered, milestone: 'MVP4' },
  { label: 'Transactions', href: '/transactions', icon: Receipt, milestone: 'MVP2' },
  { label: 'Subscriptions', href: '/subscriptions', icon: CreditCard, milestone: 'MVP8' },
  { label: 'Managed Accounts', href: '/managed-accounts', icon: Landmark, milestone: 'MVP11' },
];

export const accountNavItems: NavItem[] = [
  { label: 'Security Center', href: '/security', icon: ShieldCheck, milestone: null },
  { label: 'Profile', href: '/profile', icon: UserCircle, milestone: null },
];

export const allNavItems = [...primaryNavItems, ...accountNavItems];
