import { Radio, Users, TrendingUp } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export function Header() {
  const location = useLocation();

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold tracking-tight text-foreground">
              Signal
            </h1>
            <p className="text-xs text-muted-foreground font-body">
              Market Intelligence & Lead Discovery
            </p>
          </div>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
25:             to="/partners"
26:             className={`flex items-center gap-1.5 text-sm transition-colors ${
27:               location.pathname === "/partners"
28:                 ? "text-primary font-medium"
29:                 : "text-muted-foreground hover:text-foreground"
30:             }`}
31:           >
32:             <Users className="w-4 h-4" />
33:             Partners
34:           </Link>
35:           <Link
36:             to="/trends"
37:             className={`flex items-center gap-1.5 text-sm transition-colors ${
38:               location.pathname === "/trends"
39:                 ? "text-primary font-medium"
40:                 : "text-muted-foreground hover:text-foreground"
41:             }`}
42:           >
43:             <TrendingUp className="w-4 h-4" />
44:             Trends
45:           </Link>
46:           <span className="text-xs text-muted-foreground font-body">v1.0</span>
        </nav>
      </div>
    </header>
  );
}
