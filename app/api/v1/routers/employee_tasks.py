"""
Employee Task Management Router
For employees to view and submit their own tasks
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
from app.db.mongodb import get_db

router = APIRouter(prefix="/employee-tasks", tags=["employee-tasks"])

class TaskSubmission(BaseModel):
    task_id: str
    completion_notes: Optional[str] = None
    hours_worked: Optional[float] = None

@router.get("/{employee_code}")
async def get_my_tasks(employee_code: str):
    """Get all tasks assigned to an employee with client information"""
    db = get_db()
    
    # Get tasks from both tasks collection and profile_building
    assigned_tasks = list(db.tasks.find(
        {"assigned_to": employee_code, "status": {"$ne": "COMPLETED"}},
        {"_id": 0}
    ).sort("assigned_at", -1))
    
    # Get completed tasks from tasks collection (not profile_building)
    completed_tasks = list(db.tasks.find(
        {"assigned_to": employee_code, "status": "COMPLETED"},
        {"_id": 0}
    ).sort("completed_at", -1))
    
    # Enrich tasks with client information from permit files
    def enrich_tasks_with_client_info(tasks):
        enriched_tasks = []
        for task in tasks:
            enriched_task = task.copy()
            
            # Add client information if permit_file_id exists
            permit_file_id = task.get("permit_file_id") or task.get("source", {}).get("permit_file_id")
            if permit_file_id:
                permit_file = db.permit_files.find_one(
                    {"file_id": permit_file_id},
                    {"_id": 0, "client": 1, "project_details": 1, "file_info": 1, "file_name": 1}
                )
                if permit_file:
                    enriched_task["client_name"] = permit_file.get("client", "Unknown")
                    enriched_task["project_name"] = permit_file.get("project_details", {}).get("project_name", "Unknown")
                    enriched_task["file_info"] = permit_file.get("file_info", {})
                    
                    # Add original filename for better display
                    original_filename = (
                        permit_file.get("file_info", {}).get("original_filename") or 
                        permit_file.get("file_name", "Unknown File")
                    )
                    enriched_task["original_filename"] = original_filename
                    
                    # Generate meaningful title based on file and task info
                    if task.get("title") and task["title"] not in ["Current Assigned Task", "Untitled Task", "Unknown Task"]:
                        # Keep the original meaningful title (e.g., "structural Loading")
                        enriched_task["title"] = task["title"]
                    elif original_filename and original_filename != "Unknown File":
                        # Create title from filename and task description only if no meaningful title exists
                        task_desc = task.get("description", "").lower()
                        if "review" in task_desc or "prelims" in task_desc:
                            enriched_task["title"] = f"Review: {original_filename}"
                        elif "production" in task_desc or "produce" in task_desc:
                            enriched_task["title"] = f"Production: {original_filename}"
                        elif "qc" in task_desc or "quality" in task_desc:
                            enriched_task["title"] = f"QC: {original_filename}"
                        else:
                            enriched_task["title"] = f"Task: {original_filename}"
                    else:
                        # Final fallback
                        enriched_task["title"] = task.get("title", f"Task for {permit_file_id}")
                    
                    # Ensure permit_file_id is at top level for frontend
                    enriched_task["permit_file_id"] = permit_file_id
                else:
                    enriched_task["client_name"] = "Unknown"
                    enriched_task["project_name"] = "Unknown"
                    enriched_task["original_filename"] = "Unknown File"
                    enriched_task["title"] = task.get("title", "Unknown Task")
            else:
                enriched_task["client_name"] = "General Task"
                enriched_task["project_name"] = "General"
                enriched_task["original_filename"] = "General Task"
                # For general tasks, use existing title or create one from description
                enriched_task["title"] = (
                    task.get("title") or 
                    task.get("description") or 
                    "General Task"
                )
            
            enriched_tasks.append(enriched_task)
        
        return enriched_tasks
    
    # Enrich both assigned and completed tasks
    enriched_assigned = enrich_tasks_with_client_info(assigned_tasks)
    enriched_completed = enrich_tasks_with_client_info(completed_tasks)
    
    return {
        "assigned_tasks": enriched_assigned,
        "completed_tasks": enriched_completed,
        "total_assigned": len(enriched_assigned),
        "total_completed": len(enriched_completed)
    }

@router.post("/{employee_code}/complete")
async def submit_task_completion(employee_code: str, submission: TaskSubmission):
    """Submit a task for completion and trigger stage progression if applicable"""
    db = get_db()
    
    # Verify task is assigned to this employee
    task = db.tasks.find_one({
        "task_id": submission.task_id,
        "assigned_to": employee_code
    })
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found or not assigned to you")
    
    if task.get("status") == "COMPLETED":
        raise HTTPException(status_code=400, detail="Task already completed")
    
    completion_time = datetime.utcnow()
    
    # Calculate hours if not provided
    hours_worked = submission.hours_worked
    if not hours_worked and task.get("assigned_at"):
        try:
            assigned_time = datetime.fromisoformat(task["assigned_at"].replace('Z', '+00:00')) if isinstance(task["assigned_at"], str) else task["assigned_at"]
            hours_worked = (completion_time - assigned_time).total_seconds() / 3600
            hours_worked = round(hours_worked, 2)
        except:
            hours_worked = None
    
    # Update task status
    db.tasks.update_one(
        {"task_id": submission.task_id},
        {
            "$set": {
                "status": "COMPLETED",
                "completed_at": completion_time,
                "completion_notes": submission.completion_notes,
                "employee_hours_worked": hours_worked,
                "metadata.updated_at": completion_time
            }
        }
    )
    
    # Update profile_building entry
    profile_entry = db.profile_building.find_one({
        "task_id": submission.task_id,
        "employee_code": employee_code
    })
    
    if profile_entry:
        db.profile_building.update_one(
            {"task_id": submission.task_id, "employee_code": employee_code},
            {
                "$set": {
                    "completion_time": completion_time,
                    "hours_taken": hours_worked,
                    "completion_notes": submission.completion_notes,
                    "status": "COMPLETED",
                    "updated_at": completion_time
                }
            }
        )
    
    # Check if this task is associated with a permit file and trigger stage progression
    permit_file_id = task.get("permit_file_id") or task.get("source", {}).get("permit_file_id")
    stage_progression_result = None
    
    if permit_file_id:
        try:
            from app.services.stage_tracking_service import get_stage_tracking_service
            stage_service = get_stage_tracking_service()
            
            # Get employee name for stage tracking
            employee_doc = db.employee.find_one({"employee_code": employee_code})
            employee_name = employee_doc.get("employee_name", "Unknown") if employee_doc else "Unknown"
            
            # Complete stage and progress to next stage
            stage_progression_result = stage_service.complete_stage_and_progress(
                permit_file_id, employee_code, employee_name
            )
            
            logger.info(f"Stage progression triggered for file {permit_file_id} by employee {employee_code}")
            
        except Exception as e:
            logger.error(f"Failed to trigger stage progression for file {permit_file_id}: {str(e)}")
            # Don't fail the task completion if stage progression fails
            stage_progression_result = {"error": str(e)}
    
    result = {
        "task_id": submission.task_id,
        "status": "COMPLETED",
        "completed_at": completion_time,
        "hours_worked": hours_worked,
        "message": "Task completed successfully"
    }
    
    # Include stage progression result if applicable
    if stage_progression_result:
        result["stage_progression"] = stage_progression_result
    
    return result

@router.get("/{employee_code}/task/{task_id}")
async def get_task_details(employee_code: str, task_id: str):
    """Get details of a specific task"""
    db = get_db()
    
    # Try to find in tasks collection first
    task = db.tasks.find_one(
        {"task_id": task_id, "assigned_to": employee_code},
        {"_id": 0}
    )
    
    # If not found, check profile_building
    if not task:
        task = db.profile_building.find_one(
            {"task_id": task_id, "employee_code": employee_code},
            {"_id": 0}
        )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task
