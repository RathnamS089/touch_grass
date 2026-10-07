import { BarChart3, Leaf, Settings2, ShieldCheck } from "lucide-react";
import type { Screen } from "@/types/grounded";

interface NavigationProps {
  current: Screen;
  onNavigate: (screen: Screen) => void;
}

const items: { screen: Screen; label: string; icon: typeof Leaf }[] = [
  { screen: "main", label: "Grounded", icon: Leaf },
  { screen: "dashboard", label: "Today", icon: BarChart3 },
  { screen: "settings", label: "Settings", icon: Settings2 },
  { screen: "privacy", label: "Privacy", icon: ShieldCheck },
];

export function Navigation({ current, onNavigate }: NavigationProps) {
  return (
    <nav className="navigation" aria-label="Grounded navigation">
      <button className="brand" onClick={() => onNavigate("main")} type="button" aria-label="Return to Grounded">
        <span className="brand__mark"><Leaf size={18} /></span>
        <span>Grounded</span>
      </button>
      <div className="navigation__links">
        {items.slice(1).map(({ screen, label, icon: Icon }) => (
          <button className={current === screen ? "navigation__link is-active" : "navigation__link"} onClick={() => onNavigate(screen)} type="button" key={screen}>
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
