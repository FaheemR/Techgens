import {
  Activity,
  FileText,
  Inbox,
  LayoutDashboard,
  MessagesSquare,
  Network,
  Rocket,
  Server,
  Settings,
  SquareKanban,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "approvals";
}

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Command",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/chat", label: "Directives", icon: MessagesSquare },
      { href: "/approvals", label: "Approvals", icon: Inbox, badge: "approvals" },
      { href: "/initiatives", label: "Initiatives", icon: Rocket },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/org", label: "Org chart", icon: Network },
      { href: "/work", label: "Work board", icon: SquareKanban },
      { href: "/activity", label: "Activity", icon: Activity },
      { href: "/documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Management",
    items: [
      { href: "/strategy", label: "Strategy", icon: Target },
      { href: "/budget", label: "Budget", icon: Wallet },
      { href: "/operations", label: "Operations", icon: Server },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
