import { useState, useEffect } from "react";
import { FileStack, Plus, Filter, ArrowLeft, FileText, Calendar, User, Clock, CheckCircle, AlertCircle, Timer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermitFileRow } from "@/components/permit-files/PermitFileRow";
import { getPermitFiles, getFileStageHistory } from "@/lib/api";
import { PermitFile, PermitStatus, FileStageHistory, StageHistoryEntry } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

const statusOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Status" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_PRELIMS", label: "In Prelims" },
  { value: "IN_PRODUCTION", label: "In Production" },
  { value: "IN_QC", label: "In QC" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "DONE", label: "Done" },
];

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "default" }> = {
  PENDING: { label: "Pending", variant: "secondary" },
  IN_PRELIMS: { label: "In Prelims", variant: "warning" },
  IN_PRODUCTION: { label: "In Production", variant: "warning" },
  IN_QC: { label: "In QC", variant: "default" },
  ON_HOLD: { label: "On Hold", variant: "destructive" },
  DELIVERED: { label: "Delivered", variant: "success" },
  DONE: { label: "Done", variant: "success" },
};

export default function PermitFilesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [permitFiles, setPermitFiles] = useState<PermitFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<PermitFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<PermitFile | null>(null);
  const [stageHistory, setStageHistory] = useState<FileStageHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const { toast } = useToast();

  useEffect(() => {
    loadPermitFiles();
  }, []);

  useEffect(() => {
    filterFiles();
  }, [searchQuery, statusFilter, dateFilter, permitFiles]);

  useEffect(() => {
    if (id && permitFiles.length > 0) {
      const file = permitFiles.find(f => f._id === id);
      setSelectedFile(file || null);
      // Load stage history when file is selected
      if (file) {
        loadStageHistory(file.file_id);
      }
    } else {
      setSelectedFile(null);
      setStageHistory(null);
    }
  }, [id, permitFiles]);

  const loadPermitFiles = async () => {
    setIsLoading(true);
    try {
      const data = await getPermitFiles();
      setPermitFiles(data);
      setFilteredFiles(data);
    } catch (error) {
      console.error('[PermitFiles] Error loading permit files:', error);
      toast({
        title: "Error",
        description: "Failed to load permit files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshPermitFiles = async () => {
    // Clear cache to force fresh data
    localStorage.removeItem('permit_files');
    localStorage.removeItem('permit_files_time');
    await loadPermitFiles();
    toast({
      title: "Refreshed",
      description: "Permit files list updated",
      duration: 2000,
    });
  };

  const loadStageHistory = async (fileId: string) => {
    setIsLoadingHistory(true);
    try {
      const history = await getFileStageHistory(fileId);
      setStageHistory(history);
    } catch (error) {
      console.error('Error loading stage history:', error);
      toast({
        title: "Error",
        description: "Failed to load stage history",
        variant: "destructive",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const filterFiles = () => {
    let filtered = permitFiles;
    
    if (searchQuery) {
      filtered = filtered.filter(file => 
        file.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.file_id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    if (statusFilter !== "all") {
      filtered = filtered.filter(file => file.status === statusFilter);
    }
    
    // Date filtering
    if (dateFilter !== "all") {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      
      const startOfLastWeek = new Date(startOfWeek);
      startOfLastWeek.setDate(startOfWeek.getDate() - 7);
      
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      filtered = filtered.filter(file => {
        const fileDate = new Date(file.metadata?.created_at || file.file_info?.uploaded_at || Date.now());
        
        switch (dateFilter) {
          case "today":
            return fileDate >= today;
          case "yesterday":
            return fileDate >= yesterday && fileDate < today;
          case "this_week":
            return fileDate >= startOfWeek;
          case "last_week":
            return fileDate >= startOfLastWeek && fileDate < startOfWeek;
          case "this_month":
            return fileDate >= startOfMonth;
          case "last_month":
            return fileDate >= startOfLastMonth && fileDate < startOfMonth;
          default:
            return true;
        }
      });
    }
    
    setFilteredFiles(filtered);
  };

  // If viewing a specific file
  if (id) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading file details...</p>
          </div>
        </div>
      );
    }

    if (!selectedFile) {
      return (
        <div className="space-y-6 max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/permit-files')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Permit Files
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">File Not Found</h3>
              <p className="text-muted-foreground mb-4">
                The permit file with ID "{id}" could not be found.
              </p>
              <Button onClick={() => navigate('/permit-files')}>
                View All Files
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    const status = statusConfig[selectedFile.status] || statusConfig.PENDING;

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/permit-files')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Permit Files
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl font-mono">{selectedFile.file_id}</CardTitle>
                <p className="text-muted-foreground mt-1">{selectedFile.file_name || 'Permit File Details'}</p>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">File Type</p>
                <Badge variant={selectedFile.file_type === "NEW" ? "default" : "secondary"}>
                  {selectedFile.file_type}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Current Step</p>
                <p className="font-medium">{selectedFile.current_step || selectedFile.status}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">File Name</p>
                <p className="font-medium">{selectedFile.file_name || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">File Size</p>
                <p className="font-medium">{selectedFile.file_size ? `${(selectedFile.file_size / 1024).toFixed(2)} KB` : 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Created</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">
                    {formatDistanceToNow(
                      new Date(
                        selectedFile.metadata?.created_at || 
                        selectedFile.file_info?.uploaded_at || 
                        Date.now()
                      ), 
                      { addSuffix: true }
                    )}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">
                    {formatDistanceToNow(
                      new Date(
                        selectedFile.metadata?.updated_at || 
                        selectedFile.file_info?.uploaded_at || 
                        Date.now()
                      ), 
                      { addSuffix: true }
                    )}
                  </p>
                </div>
              </div>
              {selectedFile.uploaded_by && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Uploaded By</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">Employee #{selectedFile.uploaded_by}</p>
                  </div>
                </div>
              )}
              {selectedFile.file_path && (
                <div className="space-y-1 col-span-2">
                  <p className="text-sm text-muted-foreground">File Path</p>
                  <p className="font-mono text-sm bg-muted p-2 rounded">{selectedFile.file_path}</p>
                </div>
              )}
            </div>
            
            {/* Stage History Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Stage History</h3>
              </div>
              
              {isLoadingHistory ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : stageHistory && stageHistory.stage_history.length > 0 ? (
                <div className="space-y-3">
                  {stageHistory.stage_history.map((stage, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={
                              stage.status === 'completed' ? 'success' : 'warning'
                            }>
                              {stage.stage}
                            </Badge>
                            {stage.status === 'completed' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {stage.assigned_to ? stage.assigned_to.employee_name : 'Unassigned'}
                              </span>
                              <span className="text-muted-foreground">
                                ({stage.assigned_to ? stage.assigned_to.employee_code : 'N/A'})
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {stage.assigned_to ? stage.assigned_to.current_role : 'No Role'}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-4 text-muted-foreground text-sm">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>Created: {stage.created_at ? formatDistanceToNow(new Date(stage.created_at), { addSuffix: true }) : 'No date'}</span>
                              </div>
                              
                              {stage.assigned_at && (
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  <span>Assigned: {formatDistanceToNow(new Date(stage.assigned_at), { addSuffix: true })}</span>
                                </div>
                              )}
                              
                              {stage.started_at && (
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Started: {formatDistanceToNow(new Date(stage.started_at), { addSuffix: true })}</span>
                                </div>
                              )}
                              
                              {stage.completed_at && (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Completed: {formatDistanceToNow(new Date(stage.completed_at), { addSuffix: true })}</span>
                                </div>
                              )}
                              
                              {stage.duration_minutes && (
                                <div className="flex items-center gap-1">
                                  <Timer className="h-3 w-3" />
                                  <span>Duration: {stage.duration_minutes}m</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Stage Status Badge */}
                            <div className="mt-2">
                              <Badge 
                                variant={stage.status === 'completed' ? 'success' : 
                                        stage.status === 'in_progress' ? 'warning' : 'secondary'}
                                className="text-xs"
                              >
                                {stage.status === 'completed' ? 'Completed' :
                                 stage.status === 'in_progress' ? 'In Progress' : 'Pending'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                  
                  <div className="text-sm text-muted-foreground pt-2 border-t">
                    <p>Total Stages: {stageHistory.total_stages} | Current Stage: {stageHistory.current_stage}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No stage history available for this file</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileStack className="h-8 w-8 text-primary" />
            Permit Files
          </h1>
          <p className="text-muted-foreground mt-1">
            {filteredFiles.length} files · Track workflow from PRELIMS → PRODUCTION → QC
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refreshPermitFiles}
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <FileStack className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, client, or state..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* File List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-card border border-border">
              <Skeleton className="w-11 h-11 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredFiles.length > 0 ? (
        <div className="space-y-3">
          {filteredFiles.map((file, index) => (
            <PermitFileRow key={file._id} file={file} index={index} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <FileStack className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-lg text-muted-foreground">No permit files found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search criteria
          </p>
        </div>
      )}
    </div>
  );
}
