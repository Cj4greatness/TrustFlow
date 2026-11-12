import {
  Boxes,
  Circle,
  CreditCard,
  Factory,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
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
  team: UserCog,
  roles: ShieldCheck,
  settings: Settings,
  "communication-hub": MessageSquare,
};

export function iconFor(itemId: string): LucideIcon {
  return ICONS[itemId] ?? Circle;
}
