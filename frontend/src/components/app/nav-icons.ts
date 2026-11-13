import {
  Boxes,
  Circle,
  CreditCard,
  Factory,
  FileText,
  Handshake,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

// Icons live here, not in the navigation rules, so those stay free of UI code.
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: Users,
  products: Package,
  inventory: Boxes,
  suppliers: Factory,
  orders: ShoppingCart,
  payments: CreditCard,
  invoices: FileText,
  receipts: Receipt,
  deliveries: Truck,
  marketing: Megaphone,
  "communication-hub": MessageSquare,
  crm: Handshake,
  "ai-assistant": Sparkles,
  "business-insights": Lightbulb,
  team: UserCog,
  settings: Settings,
  "audit-logs": ScrollText,
};

export function iconFor(itemId: string): LucideIcon {
  return ICONS[itemId] ?? Circle;
}
