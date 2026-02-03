import { Bell, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getEmployees, getEmployeeTasks } from "@/lib/api";

// TODO: Get current user from auth context
const currentUser = {
  name: "Manager", // This should come from authentication
  role: "manager"  // This should come from authentication
};

interface SearchResult {
  id: string;
  type: 'employee' | 'task';
  title: string;
  subtitle: string;
  url: string;
}

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const [employees] = await Promise.all([
        getEmployees()
      ]);

      const results: SearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      // Search employees
      employees.forEach((emp: import('@/lib/api').Employee) => {
        if (
          emp.employee_name?.toLowerCase().includes(lowerQuery) ||
          emp.employee_code?.toLowerCase().includes(lowerQuery) ||
          emp.current_role?.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            id: emp.employee_code,
            type: 'employee',
            title: emp.employee_name,
            subtitle: `${emp.employee_code} • ${emp.current_role}`,
            url: `/employees/${emp.employee_code}`
          });
        }
      });

      // Note: Removed task fetching from search to prevent N+1 API calls
      // Search results only include employees, not their tasks
      // Removed console.error('Error searching tasks:', error); from here

      setSearchResults(results.slice(0, 8)); // Limit to 8 results
      setShowResults(true);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    performSearch(value);
  };

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery("");
    navigate(result.url);
  };
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Search */}
        <div className="relative w-full max-w-md" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search employees, tasks, files..." 
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchQuery && setShowResults(true)}
            className="pl-10 bg-secondary/50 border-transparent focus:border-primary/30"
          />
          
          {/* Search Results Dropdown */}
          {showResults && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
              {isSearching ? (
                <div className="p-4 text-center text-muted-foreground">
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="py-2">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center gap-3"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        result.type === 'employee' ? 'bg-blue-100' : 'bg-green-100'
                      }`}>
                        <span className="text-xs font-medium">
                          {result.type === 'employee' ? '👤' : '📋'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="p-4 text-center text-muted-foreground">
                  No results found for "{searchQuery}"
                </div>
              ) : null}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative"
            onClick={() => {
              // Navigate to notifications or show notification panel
              // For now, navigate to dashboard where notifications would be
              navigate('/');
            }}
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2"
            onClick={() => {
              // Navigate to user profile or settings
              // For now, navigate to employees directory
              navigate('/employees');
            }}
            title="User Profile"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <span className="hidden md:inline">{currentUser.name}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
