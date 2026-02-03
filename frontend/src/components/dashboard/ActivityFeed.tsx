import { formatDistanceToNow } from "date-fns";
import { CheckCircle, FileText, User, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { getRecentActivity } from "@/lib/api";

interface ActivityData {
  activities?: unknown[];
  activity_id?: string;
  activity_type?: string;
  description?: string;
  employee_name?: string;
  task_title?: string;
  activity_time?: string;
}

interface ActivityItem {
  id: string;
  type: 'task_completed' | 'file_uploaded' | 'user_assigned' | 'status_changed';
  message: string;
  timestamp: Date;
  user?: string;
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preserve current behavior: only load on mount
  }, []);

  const loadActivities = async () => {
    try {
      const data = await getRecentActivity();
      const activitiesArray = Array.isArray(data) ? data : (Array.isArray((data as ActivityData)?.activities) ? (data as ActivityData).activities : []);
      // Transform API data to ActivityItem format
      const transformedActivities: ActivityItem[] = activitiesArray.map((item: unknown) => {
        const activity = item as ActivityData;
        // Map backend activity types to frontend types
        let activityType: ActivityItem['type'] = 'status_changed';
        let message = activity.description || 'Activity recorded';
        
        if (activity.activity_type === 'completed') {
          activityType = 'task_completed';
          message = `${activity.employee_name} completed task "${activity.task_title}"`;
        } else if (activity.activity_type === 'assigned') {
          activityType = 'user_assigned';
          message = `${activity.employee_name} was assigned task "${activity.task_title}"`;
        }
        
        return {
          id: activity.activity_id || Math.random().toString(),
          type: activityType,
          message: message,
          timestamp: new Date(activity.activity_time || Date.now()),
          user: activity.employee_name
        };
      });
      setActivities(transformedActivities);
    } catch (error) {
      console.error('Error loading activities:', error);
      // Set empty state on error
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  };

  const iconMap = {
    task_completed: CheckCircle,
    file_uploaded: FileText,
    user_assigned: User,
    status_changed: AlertCircle,
  };

  const colorMap = {
    task_completed: "text-success bg-success/10",
    file_uploaded: "text-primary bg-primary/10",
    user_assigned: "text-warning bg-warning/10",
    status_changed: "text-muted-foreground bg-muted",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Recent Activity</h3>
      <div className="space-y-3">
        {isLoading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
              <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
              </div>
            </div>
          ))
        ) : activities.length > 0 ? (
          activities.map((activity, index) => {
            const Icon = iconMap[activity.type];
            return (
              <div 
                key={activity.id} 
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className={cn("p-2 rounded-lg", colorMap[activity.type])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.user && <span>{activity.user} • </span>}
                    {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          // Empty state
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
