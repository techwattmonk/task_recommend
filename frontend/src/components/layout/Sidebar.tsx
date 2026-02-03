import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Sparkles, 
  Users, 
  FileStack, 
  KanbanSquare,
  Users2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  GitBranch,
  TrendingUp
} from "lucide-react";
import { useState } from "react";
import { APP_CONFIG } from "@/config/app";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/recommender", label: "AI Recommender", icon: Sparkles },
  { path: "/employees", label: "Employees", icon: Users },
  { path: "/permit-files", label: "Permit Files", icon: FileStack },
  { path: "/task-board", label: "Task Board", icon: KanbanSquare },
  { path: "/team-lead-board", label: "Team Lead Board", icon: Users2 },
  { path: "/stage-tracking", label: "Stage Tracking", icon: GitBranch },
  { path: "/employee-performance", label: "Performance", icon: TrendingUp },
];

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  
  return (
    <aside className={cn(
      "h-screen sticky top-0 flex flex-col bg-card border-r border-border transition-all duration-300",
      collapsed ? "w-[70px]" : "w-[260px]"
    )}>
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-primary/25">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="font-bold text-lg leading-tight">{APP_CONFIG.name}</h1>
              <p className="text-xs text-muted-foreground">{APP_CONFIG.tagline}</p>
            </div>
          )}
        </Link>
      </div>
      
      {/* Nav Items */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path}>
              <Button 
                variant={isActive ? "secondary" : "ghost"} 
                className={cn(
                  "w-full justify-start gap-3 transition-all",
                  collapsed && "justify-center px-0",
                  isActive && "bg-primary/10 text-primary hover:bg-primary/15"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
                {!collapsed && <span>{item.label}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>
      
      {/* Collapse Toggle */}
      <div className="p-3 border-t border-border">
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn("w-full", collapsed && "justify-center px-0")}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
