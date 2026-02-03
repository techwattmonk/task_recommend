"""
Task Management Router - MongoDB Based with Embeddings
"""
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import uuid
import logging
import sys
import os

# Add temporal_workflows to path
sys.path.append('/home/user/smart_task_assignee/task_recommend/temporal_workflows')
from app.db.mongodb import get_db
from app.services.vertex_ai_embeddings import get_embedding_service
from app.services.recommendation_engine import get_recommendation_engine, EmployeeRecommendation
from app.services.stage_assignment_service import StageAssignmentService
from app.services.stage_tracking_service import get_stage_tracking_service, _parse_file_tracking_safely
from app.models.stage_flow import FileStage
import numpy as np
import time

from app.services.cache_service import cached

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/tasks", tags=["tasks"])

def generate_task_id():
    """Generate unique task ID"""
    return f"TASK-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

class TaskCreate(BaseModel):
    title: str
    description: str
    skills_required: Optional[List[str]] = []
    permit_file_id: Optional[str] = None
    assigned_by: str
    due_date: Optional[str] = None
    estimated_hours: Optional[float] = None
    created_from: Optional[str] = "manual"
    assignment_source: Optional[str] = "manual"  # "smart" or "manual"

class TaskAssign(BaseModel):
    employee_code: str
    assigned_by: str

# Task Recommendation Models
class TaskRecommendationRequest(BaseModel):
    task_description: str
    top_k: Optional[int] = 10
    min_similarity: Optional[float] = 0.5
    file_id: Optional[str] = None
    priority: Optional[str] = None
    required_skills: Optional[List[str]] = None
    filter_by_availability: Optional[bool] = True
    team_lead_code: Optional[str] = None

class RecommendationResponse(BaseModel):
    recommendations: List[EmployeeRecommendation]
    total_found: int
    query_info: Dict[str, Any]

@router.get("/assignment-sources")
async def get_assignment_sources():
    """Get tasks with their assignment sources for transparency"""
    db = get_db()
    
    # Get recent tasks with assignment source
    tasks = list(db.tasks.find(
        {"source.assignment_source": {"$exists": True}},
        {
            "task_id": 1,
            "title": 1,
            "assigned_to": 1,
            "assigned_to_name": 1,
            "assigned_by": 1,
            "status": 1,
            "stage": 1,
            "source.assignment_source": 1,
            "source.created_from": 1,
            "created_at": 1,
            "assigned_at": 1
        }
    ).sort("created_at", -1).limit(50))
    
    # Convert ObjectId to string
    for task in tasks:
        task["_id"] = str(task["_id"])
        if "created_at" in task and task["created_at"]:
            task["created_at"] = task["created_at"].isoformat()
        if "assigned_at" in task and task["assigned_at"]:
            task["assigned_at"] = task["assigned_at"].isoformat()
    
    return {
        "success": True,
        "tasks": tasks,
        "summary": {
            "total": len(tasks),
            "smart_assigned": len([t for t in tasks if t.get("source", {}).get("assignment_source") == "smart"]),
            "manual_assigned": len([t for t in tasks if t.get("source", {}).get("assignment_source") == "manual"])
        }
    }


@router.post("/create")
async def create_task(task_data: TaskCreate):
    """Create a new task with embedding generation and stage detection"""
    db = get_db()
    
    # Generate task ID
    task_id = generate_task_id()
    
    # Detect stage from task description with context
    task_text = f"{task_data.title}. {task_data.description}"
    
    # Use context-aware stage detection if file_id is provided
    if task_data.permit_file_id:
        detected_stage = StageAssignmentService.detect_stage_from_description_with_context(
            task_text, task_data.permit_file_id
        )
    else:
        detected_stage = StageAssignmentService.detect_stage_from_description(task_text)
    
    # Validate stage transition if file_id is provided
    validation_error = None
    validation_warning = None
    if task_data.permit_file_id and detected_stage:
        is_valid, error_msg = StageAssignmentService.check_stage_transition_validity(
            task_data.permit_file_id, detected_stage
        )
        if not is_valid:
            validation_error = error_msg
            logger.warning(f"Stage validation failed for file {task_data.permit_file_id}: {error_msg}")
            
            # Provide specific warnings based on stage
            if detected_stage == FileStage.PRODUCTION:
                validation_warning = "This file has not completed its PRELIMS stage. Complete the PRELIMS stage before moving to PRODUCTION."
            elif detected_stage == FileStage.QC:
                validation_warning = "This file has not completed its PRODUCTION stage. Complete the PRODUCTION stage before moving to QUALITY."
            elif detected_stage == FileStage.DELIVERED:
                validation_warning = "This file has not completed its QUALITY stage. Complete the QUALITY stage before marking as DELIVERED."
    
    # Generate embedding for task description
    embedding_service = get_embedding_service()
    task_embedding = embedding_service.generate_embedding(task_text)
    
    # Determine SLA eligibility
    sla_applicable = bool(task_data.permit_file_id and task_data.permit_file_id.strip())
    
    # Create task document
    task = {
        "task_id": task_id,
        "title": task_data.title,
        "description": task_data.description,
        "skills_required": task_data.skills_required,
        "source": {
            "permit_file_id": task_data.permit_file_id,
            "created_from": task_data.created_from or "manual",
            "assignment_source": task_data.assignment_source or "manual"  # Track if smart or manual
        },
        "assigned_by": task_data.assigned_by,
        "assigned_to": None,
        "status": "OPEN",
        "due_date": task_data.due_date,
        "estimated_hours": task_data.estimated_hours,
        "stage": detected_stage.value if detected_stage else None,
        "sla_applicable": sla_applicable,
        "file_id": task_data.permit_file_id if sla_applicable else None,
        "stage_validation": {
            "detected_stage": detected_stage.value if detected_stage else None,
            "validation_error": validation_error,
            "validated_at": datetime.utcnow() if validation_error else None
        },
        "embeddings": {
            "description_embedding": task_embedding,
            "embedded_text": task_text,
            "model": "text-embedding-004",
            "dimension": len(task_embedding),
            "created_at": datetime.utcnow()
        },
        "metadata": {
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
    }
    
    # Insert into MongoDB
    db.tasks.insert_one(task)
    
    response = {
        "task_id": task_id,
        "status": "OPEN",
        "message": "Task created successfully with embedding",
        "detected_stage": detected_stage.value if detected_stage else None,
        "validation_warning": validation_warning
    }
    
    return response

@router.post("/recommend", response_model=RecommendationResponse)
async def get_task_recommendations(request: TaskRecommendationRequest) -> RecommendationResponse:
    """
    Get AI-powered employee recommendations for a task using Vertex AI Gemini embeddings
    
    Performance improvements:
    - Parallel data fetching (embedding generation + employee data)
    - Smart caching (5-minute TTL for employee data)
    - Vectorized similarity computation
    - Batch operations
    
    This endpoint:
    1. Generates embeddings for the task description using Gemini (parallel)
    2. Loads employee data with caching (parallel)
    3. Computes vectorized similarities
    4. Returns top matching employees with similarity scores
    """
    start_time = time.time()
    
    try:
        engine = get_recommendation_engine()
        
        # Prepare additional context
        additional_context = {}
        if request.file_id:
            additional_context['file_id'] = request.file_id
        if request.priority:
            additional_context['priority'] = request.priority
        if request.required_skills:
            additional_context['required_skills'] = request.required_skills
        
        # Get optimized recommendations with file context
        # Determine current file stage if file_id is provided
        current_file_stage = None
        if request.file_id:
            try:
                from app.services.stage_tracking_service import get_stage_tracking_service
                stage_service = get_stage_tracking_service()
                tracking = stage_service.get_file_tracking(request.file_id)
                if tracking:
                    current_file_stage = tracking.current_stage.value
            except Exception as e:
                logger.warning(f"Failed to get file stage for {request.file_id}: {e}")
        
        recommendations = engine.get_recommendations(
            task_description=request.task_description,
            top_k=request.top_k,
            min_score=request.min_similarity,
            team_lead_code=request.team_lead_code,
            file_id=request.file_id,
            current_file_stage=current_file_stage
        )
        
        processing_time = round((time.time() - start_time) * 1000, 2)  # in milliseconds
        
        return RecommendationResponse(
            recommendations=recommendations,
            total_found=len(recommendations),
            query_info={
                "task_description": request.task_description,
                "top_k": request.top_k,
                "min_similarity": request.min_similarity,
                "filter_by_availability": request.filter_by_availability,
                "team_lead_code": request.team_lead_code,
                "embedding_model": "text-embedding-004 (Vertex AI Gemini)",
                "processing_time_ms": processing_time,
                "optimization": "parallel_execution + caching + vectorized_computation"
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")

@router.get("/team-lead-stats")
@cached(ttl_seconds=30, key_prefix="team_lead_stats")
def get_team_lead_task_stats():
    """Get task statistics grouped by team leads with actual manager names"""
    db = get_db()
    
    try:
        # Get all employees with projection for performance
        from app.services.stage_tracking_service import convert_objectid_to_str
        employees = list(db.employee.find({}, {
            "_id": 0,
            "employee_code": 1,
            "employee_name": 1,
            "reporting_manager": 1,
            "employment.current_role": 1,
            "employment.reporting_manager": 1
        }))
        employees = convert_objectid_to_str(employees)
        employee_lookup = {emp.get("employee_code"): emp for emp in employees}
        
        # Group employees by team lead using reporting_manager field
        team_groups = {}
        for emp in employees:
            manager_code = emp.get("reporting_manager", "").strip()
            team_lead_name = ""
            
            # Find manager name if code exists - try multiple matching strategies
            if manager_code:
                # Strategy 1: Extract employee code from parentheses
                extracted_code = None
                extracted_name = None
                if '(' in manager_code and ')' in manager_code:
                    # Extract code from "Name (1234)" format
                    import re
                    match = re.search(r'\(([^)]+)\)', manager_code)
                    if match:
                        extracted_code = match.group(1).strip()
                        # Extract name before parentheses
                        name_match = re.match(r'([^(]+)', manager_code.strip())
                        if name_match:
                            extracted_name = name_match.group(1).strip()
                
                # Strategy 2: Try exact match first
                if manager_code in employee_lookup:
                    team_lead_name = employee_lookup[manager_code].get("employee_name", f"Team Lead {manager_code}")
                elif extracted_code and extracted_code in employee_lookup:
                    team_lead_name = employee_lookup[extracted_code].get("employee_name", f"Team Lead {manager_code}")
                else:
                    # Strategy 3: Fallback to extracted name or use original string
                    if extracted_name:
                        team_lead_name = extracted_name
                    else:
                        team_lead_name = manager_code
                    
                    # Optional: Try partial matches as additional attempts
                    normalized_code = manager_code.replace(" ", "").replace("(", "").replace(")", "")
                    for emp_code, emp_data in employee_lookup.items():
                        normalized_emp_code = emp_code.replace(" ", "").replace("(", "").replace(")", "")
                        if normalized_code == normalized_emp_code:
                            team_lead_name = emp_data.get("employee_name", f"Team Lead {manager_code}")
                            break
                    
                    if team_lead_name == manager_code:  # Only try name match if still using fallback
                        for emp_code, emp_data in employee_lookup.items():
                            emp_name = emp_data.get("employee_name", "").lower()
                            manager_lower = manager_code.lower()
                            if emp_name and (emp_name in manager_lower or manager_lower in emp_name):
                                team_lead_name = emp_data.get("employee_name", f"Team Lead {manager_code}")
                                break
            
            if manager_code not in team_groups:
                team_groups[manager_code] = {
                    "team_lead_code": manager_code,
                    "team_lead_name": team_lead_name,
                    "employees": {},
                    "all_tasks": []
                }
        
        # Get all assigned tasks with employee details
        pipeline = [
            {
                "$match": {
                    "assigned_to": {"$exists": True, "$ne": None}
                }
            },
            {
                "$lookup": {
                    "from": "employee",
                    "localField": "assigned_to",
                    "foreignField": "employee_code",
                    "as": "employee_details",
                    "pipeline": [
                        {
                            "$project": {
                                "employee_code": 1,
                                "employee_name": 1,
                                "employment.current_role": 1,
                                "employment.reporting_manager": 1
                            }
                        }
                    ]
                }
            },
            {
                "$unwind": "$employee_details"
            }
        ]
        
        tasks_with_employees = list(db.tasks.aggregate(pipeline))
        
        # Process tasks and group by team lead
        for task in tasks_with_employees:
            emp = task["employee_details"]
            employee_code = emp.get("employee_code", "").strip()
            
            # Get the actual manager for this employee from employee_lookup
            employee_data = employee_lookup.get(employee_code, {})
            actual_manager_code = employee_data.get("reporting_manager", "").strip()
            actual_manager_name = ""
            
            if actual_manager_code and actual_manager_code in employee_lookup:
                actual_manager_name = employee_lookup[actual_manager_code].get("employee_name", f"Team Lead {actual_manager_code}")
            
            # Initialize team group if not exists
            if actual_manager_code not in team_groups:
                team_groups[actual_manager_code] = {
                    "team_lead_code": actual_manager_code,
                    "team_lead_name": actual_manager_name,
                    "employees": {},
                    "all_tasks": []
                }
            
            # Add employee if not already added (unique by employee_code)
            if employee_code not in team_groups[actual_manager_code]["employees"]:
                team_groups[actual_manager_code]["employees"][employee_code] = {
                    "employee_code": emp["employee_code"],
                    "employee_name": emp["employee_name"],
                    "employee_role": emp.get("employment", {}).get("current_role", "Not specified"),
                    "task_count": 0,
                    "tasks": []
                }
            
            # Add task to employee and team
            task_data = {
                "task_id": task.get("task_id"),
                "task_title": task.get("task_description", task.get("task_title", "Untitled Task")),
                "status": task.get("status", "UNKNOWN"),
                "assigned_at": task.get("assigned_at"),
                "completed_at": task.get("completed_at")
            }
            
            team_groups[actual_manager_code]["employees"][employee_code]["tasks"].append(task_data)
            team_groups[actual_manager_code]["employees"][employee_code]["task_count"] += 1
            team_groups[actual_manager_code]["all_tasks"].append(task_data)
        
        # Calculate statistics for each team
        team_stats = []
        for team_code, team_data in team_groups.items():
            employees_dict = team_data["employees"]
            all_tasks = team_data["all_tasks"]
            
            # Create flattened list for display (grouped by employee)
            employees_list = []
            for emp_code, emp_data in employees_dict.items():
                # Add employee entry with task count
                employees_list.append({
                    "employee_code": emp_data["employee_code"],
                    "employee_name": emp_data["employee_name"],
                    "employee_role": emp_data["employee_role"],
                    "task_count": emp_data["task_count"],
                    "tasks": emp_data["tasks"]  # Keep tasks for detailed view
                })
            
            # Sort employees by task count (ascending) for better assignment decisions
            employees_list.sort(key=lambda x: x["task_count"])
            
            # Calculate statistics based on all tasks
            total_tasks = len(all_tasks)
            completed_tasks = len([t for t in all_tasks if t["status"] == "COMPLETED"])
            in_progress_tasks = len([t for t in all_tasks if t["status"] == "IN_PROGRESS"])
            assigned_tasks = len([t for t in all_tasks if t["status"] == "ASSIGNED"])
            completion_rate = round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)
            
            team_stats.append({
                "team_lead_code": team_code,
                "team_lead_name": team_data["team_lead_name"],
                "employees": employees_list,  # Grouped by employee with task counts
                "unique_employees": len(employees_dict),
                "total_tasks": total_tasks,
                "completed_tasks": completed_tasks,
                "in_progress_tasks": in_progress_tasks,
                "assigned_tasks": assigned_tasks,
                "completion_rate": completion_rate,
                "status": "ACTIVE" if total_tasks > 0 else "IDLE"
            })
        
        return {
            "team_stats": team_stats,
            "total_teams": len(team_stats),
            "last_updated": datetime.utcnow().isoformat() + 'Z'
        }
    
    except Exception as e:
        logger.error(f"Error in get_team_lead_task_stats: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching team lead stats: {str(e)}")

@router.get("/permit-file-tracking")
def get_permit_file_tracking():
    """Track progress of permit files and assigned employees"""
    db = get_db()
    
    try:
        # Aggregate tasks by permit file
        pipeline = [
            {
                "$match": {
                    "source.permit_file_id": {"$exists": True, "$ne": None}
                }
            },
            {
                "$lookup": {
                    "from": "employee",
                    "localField": "assigned_to",
                    "foreignField": "employee_code",
                    "as": "employee_details",
                    "pipeline": [
                        {
                            "$project": {
                                "employee_code": 1,
                                "employee_name": 1,
                                "employment.current_role": 1,
                                "employment.reporting_manager": 1
                            }
                        }
                    ]
                }
            },
            {
                "$unwind": "$employee_details"
            },
            {
                "$group": {
                    "_id": "$source.permit_file_id",
                    "permit_file_id": {"$first": "$source.permit_file_id"},
                    "tasks": {
                        "$push": {
                            "task_id": "$task_id",
                            "task_title": {"$ifNull": ["$title", "$task_assigned", "$task_description"]},
                            "status": "$status",
                            "assigned_to": "$assigned_to",
                            "employee_name": "$employee_details.employee_name",
                            "employee_role": "$employee_details.employment.current_role",
                            "team_lead": "$employee_details.employment.reporting_manager.employee_name",
                            "assigned_at": "$assigned_at",
                            "completed_at": "$completed_at"
                        }
                    }
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "permit_file_id": 1,
                    "tasks": 1,
                    "total_tasks": {"$size": "$tasks"},
                    "completed_tasks": {
                        "$size": {
                            "$filter": {
                                "input": "$tasks",
                                "cond": {"$in": ["$$this.status", ["COMPLETED", "DONE"]]}
                            }
                        }
                    },
                    "in_progress_tasks": {
                        "$size": {
                            "$filter": {
                                "input": "$tasks",
                                "cond": {"$eq": ["$$this.status", "IN_PROGRESS"]}
                            }
                        }
                    },
                    "assigned_tasks": {
                        "$size": {
                            "$filter": {
                                "input": "$tasks",
                                "cond": {"$eq": ["$$this.status", "ASSIGNED"]}
                            }
                        }
                    }
                }
            },
            {
                "$addFields": {
                    "completion_rate": {
                        "$round": [
                            {
                                "$multiply": [
                                    {
                                        "$divide": ["$completed_tasks", "$total_tasks"]
                                    },
                                    100
                                ]
                            },
                            1
                        ]
                    },
                    "status": {
                        "$switch": {
                            "branches": [
                                {"case": {"$eq": ["$completed_tasks", "$total_tasks"]}, "then": "COMPLETED"},
                                {"case": {"$gt": ["$in_progress_tasks", 0]}, "then": "IN_PROGRESS"},
                                {"case": {"$gt": ["$assigned_tasks", 0]}, "then": "ASSIGNED"}
                            ],
                            "default": "PENDING"
                        }
                    }
                }
            }
        ]
        
        # Add final projection to exclude _id
        pipeline.append({
            "$project": {
                "_id": 0,
                "permit_file_id": 1,
                "tasks": 1,
                "total_tasks": 1,
                "completed_tasks": 1,
                "in_progress_tasks": 1,
                "assigned_tasks": 1,
                "completion_rate": 1,
                "status": 1
            }
        })
        
        permit_files = list(db.tasks.aggregate(pipeline))

        # Attach original filename to each permit file entry (so UI can show real name)
        file_ids = [pf.get("permit_file_id") for pf in permit_files if pf.get("permit_file_id")]
        name_map = {}
        if file_ids:
            for pf_doc in db.permit_files.find(
                {"file_id": {"$in": file_ids}},
                {"_id": 0, "file_id": 1, "file_info.original_filename": 1, "file_name": 1},
            ):
                fid = pf_doc.get("file_id")
                if fid:
                    name_map[fid] = (
                        pf_doc.get("file_info", {}).get("original_filename")
                        or pf_doc.get("file_name")
                        or fid
                    )
        
        # Format dates
        for permit_file in permit_files:
            permit_id = permit_file.get("permit_file_id")
            if permit_id:
                permit_file["file_name"] = name_map.get(permit_id, permit_id)
            for task in permit_file["tasks"]:
                if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
                    task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
                if task.get("completed_at") and isinstance(task["completed_at"], datetime):
                    task["completed_at"] = task["completed_at"].isoformat() + 'Z'
        
        return {
            "data": permit_files,
            "total_permit_files": len(permit_files),
            "last_updated": datetime.utcnow().isoformat() + 'Z'
        }
    
    except Exception as e:
        logger.error(f"Error in get_permit_file_tracking: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching permit file tracking: {str(e)}")

@router.get("/recent-activity")
async def get_recent_activity():
    """Get recent task activity across all employees"""
    db = get_db()
    
    try:
        # Get recent tasks with employee details, sorted by most recent activity
        pipeline = [
            {
                "$match": {
                    "$or": [
                        {"assigned_at": {"$exists": True}},
                        {"completed_at": {"$exists": True}}
                    ]
                }
            },
            {
                "$lookup": {
                    "from": "employee",
                    "localField": "assigned_to",
                    "foreignField": "employee_code",
                    "as": "employee_details",
                    "pipeline": [
                        {
                            "$project": {
                                "employee_code": 1,
                                "employee_name": 1,
                                "employment.current_role": 1,
                                "employment.reporting_manager": 1
                            }
                        }
                    ]
                }
            },
            {
                "$unwind": "$employee_details"
            },
            {
                "$addFields": {
                    "latest_activity": {
                        "$cond": {
                            "if": {"$gt": [{"$ifNull": ["$completed_at", None]}, {"$ifNull": ["$assigned_at", None]}]},
                            "then": "$completed_at",
                            "else": "$assigned_at"
                        }
                    }
                }
            },
            {"$sort": {"latest_activity": -1}},
            {"$limit": 20},
            {
                "$project": {
                    "_id": 0,
                    "task_id": 1,
                    "title": 1,
                    "task_description": 1,
                    "status": 1,
                    "assigned_to": 1,
                    "assigned_at": 1,
                    "completed_at": 1,
                    "employee_details": 1,
                    "latest_activity": 1
                }
            }
        ]
        
        recent_tasks = list(db.tasks.aggregate(pipeline))
        
        # Process activities
        activities = []
        for task in recent_tasks:
            emp = task["employee_details"]
            team_lead_info = emp.get("employment", {}).get("reporting_manager", {})
            
            # Determine activity type and timestamp
            if task.get("completed_at") and task.get("assigned_at"):
                if task["completed_at"] > task["assigned_at"]:
                    activity_type = "completed"
                    activity_time = task["completed_at"]
                    description = f"completed task '{task.get('title') or task.get('task_assigned', 'Untitled')}'"
                else:
                    activity_type = "assigned"
                    activity_time = task["assigned_at"]
                    description = f"was assigned task '{task.get('title') or task.get('task_assigned', 'Untitled')}'"
            elif task.get("completed_at"):
                activity_type = "completed"
                activity_time = task["completed_at"]
                description = f"completed task '{task.get('title') or task.get('task_assigned', 'Untitled')}'"
            elif task.get("assigned_at"):
                activity_type = "assigned"
                activity_time = task["assigned_at"]
                description = f"was assigned task '{task.get('title') or task.get('task_assigned', 'Untitled')}'"
            else:
                continue
            
            # Format dates
            if isinstance(activity_time, datetime):
                activity_time = activity_time.isoformat() + 'Z'
            
            activities.append({
                "activity_id": f"{task['task_id']}-{activity_type}",
                "activity_type": activity_type,
                "employee_code": emp["employee_code"],
                "employee_name": emp["employee_name"],
                "employee_role": emp.get("employment", {}).get("current_role", "Not specified"),
                "team_lead": team_lead_info.get("name", "Unassigned"),
                "task_id": task["task_id"],
                "task_title": task.get("title") or task.get("task_assigned", "Untitled"),
                "description": description,
                "activity_time": activity_time,
                "status": task.get("status", "UNKNOWN")
            })
        
        return {
            "activities": activities,
            "total_activities": len(activities),
            "last_updated": datetime.utcnow().isoformat() + 'Z'
        }
    
    except Exception as e:
        print(f"Error in get_recent_activity: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching recent activity: {str(e)}")

@router.get("/completed-today")
async def get_completed_today():
    """Get tasks completed today"""
    db = get_db()
    
    # Get today's date in UTC
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    try:
        tomorrow = today + timedelta(days=1)
        today_prefix = today.strftime("%Y-%m-%d")

        # Find tasks completed today.
        # completed_at can be stored either as a datetime or as an ISO string.
        completed_tasks = list(db.tasks.find({
            "status": "COMPLETED",
            "$or": [
                {"completed_at": {"$gte": today, "$lt": tomorrow}},
                {"completed_at": {"$regex": f"^{today_prefix}"}}
            ]
        }, {"_id": 0}))

        def to_iso(value: Any) -> Optional[str]:
            if value is None:
                return None
            if isinstance(value, datetime):
                return value.isoformat() + 'Z'
            if isinstance(value, str):
                return value
            return str(value)
        
        # Get employee details for completed tasks
        result = []
        for task in completed_tasks:
            # Find employee details
            employee = db.employee.find_one({"employee_code": task.get("assigned_to")})
            team_lead_info = employee.get("employment", {}).get("reporting_manager", {}) if employee else {}
            
            completed_task = {
                "task_id": task["task_id"],
                "task_title": task.get("title") or task.get("task_assigned", "Untitled"),
                "employee_code": task.get("assigned_to", ""),
                "employee_name": employee.get("employee_name", "Unknown") if employee else "Unknown",
                "employee_role": employee.get("employment", {}).get("current_role", "Not specified") if employee else "Not specified",
                "team_lead": team_lead_info.get("name", "Unassigned"),
                "completed_at": to_iso(task.get("completed_at")),
                "assigned_at": to_iso(task.get("assigned_at"))
            }
            result.append(completed_task)
        
        return {
            "completed_today": result,
            "total_completed": len(result),
            "date": today.isoformat() + 'Z',
            "last_updated": datetime.utcnow().isoformat() + 'Z'
        }
    
    except Exception as e:
        print(f"Error in get_completed_today: {e}")
        import traceback
        traceback.print_exc()
        # Return empty result instead of error
        return {
            "completed_today": [],
            "total_completed": 0,
            "date": today.strftime("%Y-%m-%d"),
            "last_updated": datetime.utcnow().isoformat() + 'Z',
            "error": str(e)
        }

@router.get("/ready-for-assignment")
async def get_files_ready_for_assignment(stage: Optional[str] = Query(None)):
    """Get files that are ready for assignment based on stage progression"""
    db = get_db()
    
    try:
        from app.models.stage_flow import FileStage
        
        stage_service = get_stage_tracking_service()
        
        # If no stage specified, get files ready for PRELIMS (new files)
        if not stage:
            stage = FileStage.PRELIMS
        
        # Validate stage
        try:
            target_stage = FileStage(stage.upper())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid stage: {stage}")
        
        # Get files ready for the specified stage
        ready_files = stage_service.get_files_ready_for_stage(target_stage)
        
        return {
            "success": True,
            "stage": target_stage.value,
            "files": ready_files,
            "total": len(ready_files),
            "message": f"Found {len(ready_files)} files ready for {target_stage.value} stage"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting ready files: {str(e)}")

@router.get("/assigned")
async def get_all_assigned_tasks():
    """Get all assigned tasks with employee details - OPTIMIZED for task board"""
    db = get_db()
    
    try:
        # Simple query first to avoid aggregation issues
        tasks = list(db.tasks.find(
            {
                "assigned_to": {"$exists": True, "$ne": None},
                "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
            },
            {
                "_id": 0,
                "task_id": 1,
                "title": 1,
                "task_description": 1,
                "task_assigned": 1,
                "status": 1,
                "assigned_at": 1,
                "time_assigned": 1,
                "date_assigned": 1,
                "assigned_by": 1,
                "assigned_to": 1,
                "assigned_to_name": 1,
                "completed_at": 1
            }
        ))
        
        # Get unique employee codes
        employee_codes = list(set(task.get("assigned_to") for task in tasks if task.get("assigned_to")))
        
        # Fetch employee details in batch
        employees = {}
        if employee_codes:
            employee_docs = list(db.employee.find(
                {"employee_code": {"$in": employee_codes}},
                {
                    "employee_code": 1,
                    "employee_name": 1,
                    "employment.current_role": 1,
                    "employment.shift": 1,
                    "employment.status_1": 1,
                    "_id": 0
                }
            ))
            employees = {emp["employee_code"]: emp for emp in employee_docs}
        
        # Combine task and employee data
        for task in tasks:
            emp_code = task.get("assigned_to")
            if emp_code and emp_code in employees:
                task["employee_details"] = employees[emp_code]
            
            # Format dates
            if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
                task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
            if task.get("completed_at") and isinstance(task["completed_at"], datetime):
                task["completed_at"] = task["completed_at"].isoformat() + 'Z'
        
        return {
            "tasks": tasks,
            "total": len(tasks),
            "last_updated": datetime.utcnow().isoformat() + 'Z'
        }
    
    except Exception as e:
        print(f"Error in get_all_assigned_tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching assigned tasks: {str(e)}")

@router.get("/employee/{employee_code}/assigned") 
async def get_employee_assigned_tasks(employee_code: str):
    """Get assigned tasks for a specific employee - for incremental updates"""
    db = get_db()
    
    # Get employee details and tasks in one query
    employee = db.employee.find_one(
        {"employee_code": employee_code},
        {
            "employee_code": 1,
            "employee_name": 1,
            "employment.current_role": 1,
            "employment.shift": 1,
            "employment.status_1": 1,
            "_id": 0
        }
    )
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Get assigned tasks for this employee
    tasks = list(db.tasks.find(
        {
            "assigned_to": employee_code,
            "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
        },
        {
            "_id": 0,
            "task_id": 1,
            "title": 1,
            "task_description": 1,
            "task_assigned": 1,
            "status": 1,
            "assigned_at": 1,
            "time_assigned": 1,
            "date_assigned": 1,
            "assigned_by": 1,
            "completed_at": 1
        }
    ))
    
    # Format dates
    for task in tasks:
        if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
            task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
        if task.get("completed_at") and isinstance(task["completed_at"], datetime):
            task["completed_at"] = task["completed_at"].isoformat() + 'Z'
    
    return {
        "employee": employee,
        "tasks": tasks,
        "total": len(tasks)
    }

@router.get("/employee/{employee_code}/completed")
async def get_employee_completed_tasks(employee_code: str):
    """Get completed tasks for a specific employee"""
    db = get_db()
    
    # Verify employee exists
    employee = db.employee.find_one({"employee_code": employee_code})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # Get completed tasks for this employee
    tasks = list(db.tasks.find(
        {
            "assigned_to": employee_code,
            "status": "COMPLETED"
        },
        {
            "_id": 0,
            "task_id": 1,
            "title": 1,
            "description": 1,
            "assigned_at": 1,
            "completed_at": 1,
            "status": 1,
            "skills_required": 1,
            "source": 1
        }
    ).sort("completed_at", -1))  # Sort by completion date, most recent first
    
    # Format dates to include timezone info
    for task in tasks:
        if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
            task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
        if task.get("completed_at") and isinstance(task["completed_at"], datetime):
            task["completed_at"] = task["completed_at"].isoformat() + 'Z'
    
    return {
        "tasks": tasks,
        "total": len(tasks)
    }

@router.get("/")
async def get_all_tasks():
    """Get all tasks"""
    db = get_db()
    tasks = list(db.tasks.find({}, {"_id": 0, "embeddings.description_embedding": 0}))
    
    # Format dates to include timezone info
    for task in tasks:
        if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
            task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
        if task.get("completed_at") and isinstance(task["completed_at"], datetime):
            task["completed_at"] = task["completed_at"].isoformat() + 'Z'
        if task.get("metadata", {}).get("updated_at") and isinstance(task["metadata"]["updated_at"], datetime):
            task["metadata"]["updated_at"] = task["metadata"]["updated_at"].isoformat() + 'Z'
    
    return tasks

@router.get("/{task_id}")
async def get_task(task_id: str):
    """Get a specific task"""
    db = get_db()
    task = db.tasks.find_one({"task_id": task_id}, {"_id": 0, "embeddings.description_embedding": 0})
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Format dates to include timezone info
    if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
        task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
    if task.get("completed_at") and isinstance(task["completed_at"], datetime):
        task["completed_at"] = task["completed_at"].isoformat() + 'Z'
    if task.get("metadata", {}).get("updated_at") and isinstance(task["metadata"]["updated_at"], datetime):
        task["metadata"]["updated_at"] = task["metadata"]["updated_at"].isoformat() + 'Z'
    
    return task

@router.post("/{task_id}/assign")
async def assign_task(task_id: str, assignment: TaskAssign):
    """Assign task to employee and update profile_building"""
    db = get_db()
    
    # Get task
    task = db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get employee
    employee = db.employee.find_one({"employee_code": assignment.employee_code})
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Create or update file tracking for ALL tasks to ensure dashboard visibility
    stage_service = get_stage_tracking_service()
    
    # Determine file_id and stage
    file_id = task.get("source", {}).get("permit_file_id")
    if not file_id:
        # Create virtual file ID for standalone tasks
        file_id = f"TASK-{task_id}"
    
    task_stage_raw = task.get("stage") or "PRELIMS"
    try:
        task_stage = FileStage(task_stage_raw)
    except Exception:
        task_stage = FileStage.PRELIMS

    # Ensure file tracking exists
    tracking_doc = stage_service.get_file_tracking(file_id)
    if not tracking_doc:
        stage_service.initialize_file_tracking(file_id, task_stage)
        tracking_doc = stage_service.get_file_tracking(file_id)
        
        # Link task to file tracking in metadata
        db.file_tracking.update_one(
            {"file_id": file_id},
            {"$set": {"linked_task_id": task_id, "task_type": "standalone_task"}}
        )
    
    # Validate stage prerequisites if file_id exists
    if task.get("source", {}).get("permit_file_id"):
        # First reconcile based on already completed tasks
        try:
            stage_service.auto_progress_from_tasks(file_id)
        except Exception:
            pass

        tracking_doc = stage_service.get_file_tracking(file_id)
        tracking = _parse_file_tracking_safely(tracking_doc) if isinstance(tracking_doc, dict) else tracking_doc

        if tracking:
            if task_stage == FileStage.PRODUCTION:
                if tracking.current_stage == FileStage.PRELIMS:
                    # Check if PRELIMS is completed (all tasks done)
                    prelims_tasks = db.tasks.count_documents({
                        "source.permit_file_id": file_id,
                        "stage": "PRELIMS",
                        "status": {"$nin": ["COMPLETED", "DONE"]}
                    })
                    
                    if prelims_tasks == 0:
                        # PRELIMS is completed, auto-progress to PRODUCTION
                        stage_service.auto_progress_from_tasks(file_id)
                        tracking_doc = stage_service.get_file_tracking(file_id)
                        tracking = _parse_file_tracking_safely(tracking_doc) if isinstance(tracking_doc, dict) else tracking_doc
                    else:
                        # PRELIMS still has incomplete tasks, don't allow PRODUCTION yet
                        raise HTTPException(
                            status_code=400,
                            detail=f"File must complete PRELIMS stage before assigning PRODUCTION tasks. {prelims_tasks} PRELIMS tasks still incomplete.",
                        )

                if not tracking or tracking.current_stage != FileStage.PRODUCTION:
                    raise HTTPException(
                        status_code=400,
                        detail="File must be in PRODUCTION stage to assign PRODUCTION tasks",
                    )

            if task_stage == FileStage.QC:
                # QC tasks only after production completion (COMPLETED)
                if tracking.current_stage != FileStage.QC:
                    if tracking.current_stage == FileStage.COMPLETED:
                        # Production is completed, move to QC
                        stage_service.transition_to_next_stage(file_id, assignment.employee_code, FileStage.QC)
                        tracking_doc = stage_service.get_file_tracking(file_id)
                        tracking = _parse_file_tracking_safely(tracking_doc) if isinstance(tracking_doc, dict) else tracking_doc
                    else:
                        # Production not completed yet, don't allow QC
                        raise HTTPException(
                            status_code=400,
                            detail=f"File must complete PRODUCTION stage before assigning QC tasks. Current stage: {tracking.current_stage}",
                        )

                if not tracking or tracking.current_stage != FileStage.QC:
                    raise HTTPException(
                        status_code=400,
                        detail="File must be in QC stage to assign QC tasks",
                    )
    
    assigned_time = datetime.utcnow()
    
    # Update task status
    db.tasks.update_one(
        {"task_id": task_id},
        {
            "$set": {
                "assigned_to": assignment.employee_code,
                "assigned_to_name": employee["employee_name"],
                "assigned_by": assignment.assigned_by,
                "assigned_at": assigned_time,
                "status": "ASSIGNED",
                "metadata.updated_at": assigned_time
            }
        }
    )
    
    # Add to profile_building collection (minimal fields as per requirement)
    profile_entry = {
        "employee_code": assignment.employee_code,
        "employee_name": employee["employee_name"],
        "task_id": task_id,
        "task_assigned": task["description"],
        "date_assigned": assigned_time.date().isoformat(),  # Convert to string
        "time_assigned": assigned_time,
        "completion_time": None,
        "hours_taken": None,
        "status": "ASSIGNED",
        "permit_file_id": task.get("source", {}).get("permit_file_id"),
        "assigned_by": assignment.assigned_by,
        "created_at": assigned_time,
        "updated_at": assigned_time
    }
    
    db.profile_building.insert_one(profile_entry)
    
    # Write to task_file_map fact table if SLA-applicable
    file_id = task.get("source", {}).get("permit_file_id")
    if file_id and file_id.strip():
        try:
            from app.services.clickhouse_service import clickhouse_service
            clickhouse_service.client.execute(
                'INSERT INTO task_file_map (task_id, file_id, employee_id, employee_name, assigned_at, task_status, stage) VALUES',
                [(task_id, file_id, assignment.employee_code, employee["employee_name"], 
                  assigned_time, 'ASSIGNED', task.get('stage', 'UNASSIGNED'))]
            )
            logger.info(f"Inserted task_file_map record for {task_id}")
            
            # Update file_lifecycle.current_stage for real-time tracking
            # (safe because prerequisite validation already passed above)
            task_stage = task.get('stage', 'PRELIMS')
            clickhouse_service.update_file_stage(file_id, task_stage)
            logger.info(f"Updated file_lifecycle stage for {file_id} to {task_stage}")
            
        except Exception as e:
            logger.error(f"Failed to insert task_file_map or update file_lifecycle: {e}")
    
    # Create or update stage tracking based on assigned task stage (best-effort)
    if file_id:
        try:
            stage_service = get_stage_tracking_service()
            task_stage_raw = task.get("stage") or "PRELIMS"
            try:
                task_stage = FileStage(task_stage_raw)
            except Exception:
                task_stage = FileStage.PRELIMS

            tracking_doc = stage_service.get_file_tracking(file_id)
            tracking = _parse_file_tracking_safely(tracking_doc) if isinstance(tracking_doc, dict) else tracking_doc
            if tracking and tracking.current_stage == task_stage:
                stage_service.assign_employee_to_stage(file_id, assignment.employee_code, employee["employee_name"])
        except Exception as e:
            logger.warning(f"Failed to update stage tracking for task {task_id}: {e}")
    
    # Emit task assignment event to ClickHouse for real-time analytics
    try:
        from app.services.clickhouse_service import clickhouse_service
        await clickhouse_service.emit_task_assigned_event(
            task_id=task_id,
            employee_code=assignment.employee_code,
            employee_name=employee["employee_name"],
            assigned_by=assignment.assigned_by,
            file_id_param=task.get("source", {}).get("permit_file_id")
        )
    except Exception as e:
        logger.warning(f"Failed to emit task_assigned event: {e}")
    
    # Send websocket notification to assigned employee
    try:
        from app.services.websocket_manager import websocket_manager
        notification_data = {
            "type": "task_assigned",
            "task_id": task_id,
            "employee_code": assignment.employee_code,
            "employee_name": employee["employee_name"],
            "task_description": task["description"],
            "assigned_by": assignment.assigned_by,
            "assigned_at": assigned_time.isoformat()
        }
        await websocket_manager.send_to_user(assignment.employee_code, notification_data)
        logger.info(f"Notification sent to employee {assignment.employee_code} for task {task_id}")
    except Exception as e:
        logger.warning(f"Failed to send notification: {str(e)}")
    
    # Invalidate stage tracking cache to ensure immediate dashboard updates
    try:
        stage_service = get_stage_tracking_service()
        # Clear the pipeline view cache
        if hasattr(stage_service, '_cache') and 'pipeline_view' in stage_service._cache:
            del stage_service._cache['pipeline_view']
            logger.info(f"Invalidated stage tracking cache after task {task_id} assignment")
    except Exception as e:
        logger.warning(f"Failed to invalidate stage tracking cache: {e}")
    
    # ENSURE DASHBOARD VISIBILITY: Create file tracking for standalone tasks
    try:
        stage_service = get_stage_tracking_service()
        file_id = task.get("source", {}).get("permit_file_id")
        
        # If no file_id exists, create virtual file tracking for dashboard visibility
        if not file_id:
            file_id = f"TASK-{task_id}"
            task_stage_raw = task.get("stage") or "PRELIMS"
            try:
                task_stage = FileStage(task_stage_raw)
            except Exception:
                task_stage = FileStage.PRELIMS
            
            # Check if file tracking already exists
            existing_tracking = stage_service.get_file_tracking(file_id)
            if not existing_tracking:
                # Initialize file tracking for dashboard visibility
                stage_service.initialize_file_tracking(file_id, task_stage)
                
                # Link to task for reference
                db.file_tracking.update_one(
                    {"file_id": file_id},
                    {"$set": {
                        "linked_task_id": task_id,
                        "task_type": "standalone_task",
                        "task_title": task.get("title", ""),
                        "virtual_file": True
                    }}
                )
                logger.info(f"Created file tracking for standalone task {task_id} -> {file_id}")
            
            # Assign employee to the file tracking for dashboard visibility
            stage_service.assign_employee_to_stage(
                file_id=file_id,
                employee_code=assignment.employee_code,
                notes=f"Task assignment: {task.get('title', 'N/A')}"
            )
            logger.info(f"Assigned employee {assignment.employee_code} to file tracking {file_id}")
            
    except Exception as e:
        logger.warning(f"Failed to create file tracking for task {task_id}: {e}")
    
    return {
        "task_id": task_id,
        "assigned_to": assignment.employee_code,
        "assigned_to_name": employee["employee_name"],
        "status": "ASSIGNED",
        "profile_updated": True,
        "message": "Task assigned and added to employee profile"
    }

@router.post("/{task_id}/start")
async def start_task(task_id: str, employee_code: str = Query(...)):
    """Start work on a task - update status from ASSIGNED to IN_PROGRESS"""
    db = get_db()
    
    start_time = datetime.utcnow()
    
    # Get task
    task = db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Validate task is assigned to this employee
    if task.get("assigned_to") != employee_code:
        raise HTTPException(status_code=403, detail="Task not assigned to this employee")
    
    # Validate task is in ASSIGNED status
    if task.get("status") != "ASSIGNED":
        raise HTTPException(status_code=400, detail=f"Task cannot be started. Current status: {task.get('status')}")
    
    # Update task status to IN_PROGRESS
    db.tasks.update_one(
        {"task_id": task_id},
        {
            "$set": {
                "status": "IN_PROGRESS",
                "work_started_at": start_time,
                "metadata.updated_at": start_time
            }
        }
    )
    
    # Update profile_building collection
    db.profile_building.update_one(
        {"employee_code": employee_code},
        {
            "$set": {
                "status": "IN_PROGRESS",
                "work_started_at": start_time,
                "updated_at": start_time
            }
        }
    )
    
    # Emit stage started event to ClickHouse for real-time analytics
    try:
        from app.services.clickhouse_service import clickhouse_service
        await clickhouse_service.emit_stage_started_event(
            task_id=task_id,
            employee_code=employee_code,
            employee_name=task.get("assigned_to_name", f"Employee {employee_code}"),
            stage=task.get("stage", "PRELIMS"),
            file_id=task.get("source", {}).get("permit_file_id")
        )
    except Exception as e:
        logger.warning(f"Failed to emit stage_started event: {e}")
    
    # Send websocket notification
    try:
        from app.services.websocket_manager import websocket_manager
        notification_data = {
            "type": "task_started",
            "task_id": task_id,
            "employee_code": employee_code,
            "task_description": task["description"],
            "work_started_at": start_time.isoformat()
        }
        await websocket_manager.send_to_user(employee_code, notification_data)
        logger.info(f"Work started notification sent for task {task_id} by employee {employee_code}")
    except Exception as e:
        logger.warning(f"Failed to send start work notification: {str(e)}")
    
    return {
        "task_id": task_id,
        "employee_code": employee_code,
        "status": "IN_PROGRESS",
        "work_started_at": start_time.isoformat() + 'Z',
        "message": "Work started successfully"
    }

@router.post("/{task_id}/complete")
async def complete_task(task_id: str, employee_code: str = Query(...)):
    """Mark task as complete and update profile_building"""
    db = get_db()
    
    completion_time = datetime.utcnow()
    
    # Get task
    task = db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Update task status
    db.tasks.update_one(
        {"task_id": task_id},
        {
            "$set": {
                "status": "COMPLETED",
                "completed_at": completion_time,
                "completed_by": employee_code,
                "metadata.updated_at": completion_time
            }
        }
    )
    
    # Calculate duration for analytics
    work_started_at = task.get("work_started_at") or task.get("assigned_at")
    duration_minutes = 0
    if work_started_at and isinstance(work_started_at, datetime):
        if isinstance(completion_time, datetime):
            duration_minutes = int((completion_time - work_started_at).total_seconds() / 60)
        elif isinstance(completion_time, str):
            completion_dt = datetime.fromisoformat(completion_time.replace('Z', '+00:00'))
            duration_minutes = int((completion_dt - work_started_at).total_seconds() / 60)
    
    # Emit stage completed event to ClickHouse for real-time analytics
    try:
        from app.services.clickhouse_service import clickhouse_service
        await clickhouse_service.emit_stage_completed_event(
            task_id=task_id,
            employee_code=employee_code,
            employee_name=task.get("assigned_to_name", f"Employee {employee_code}"),
            stage=task.get("stage", "UNKNOWN"),
            duration_minutes=duration_minutes,
            file_id_param=task.get("source", {}).get("permit_file_id")
        )
        
        # Update file_lifecycle.current_stage for real-time tracking
        file_id = task.get("source", {}).get("permit_file_id")
        if file_id:
            # Determine next stage based on current stage
            current_stage = task.get("stage", "PRELIMS")
            if current_stage == "PRODUCTION":
                # After completing production, move to COMPLETED
                clickhouse_service.update_file_stage(file_id, "COMPLETED")
                logger.info(f"Updated file_lifecycle stage for {file_id} to COMPLETED")
            elif current_stage == "QC":
                # After completing QC, move to DELIVERED
                clickhouse_service.update_file_stage(file_id, "DELIVERED")
                logger.info(f"Updated file_lifecycle stage for {file_id} to DELIVERED")
        
    except Exception as e:
        logger.warning(f"Failed to emit stage_completed event: {e}")
    
    # Update employee profile
    if task_id and task_id.strip():  # Ensure task_id is not null or empty
        try:
            db.profile_building.update_one(
                {"employee_code": employee_code},
                {
                    "$push": {
                        "completed_tasks": {
                            "task_id": task_id,
                            "task_title": task.get("task_title", "Untitled Task"),
                            "completed_at": completion_time.isoformat() + 'Z',
                            "skills": task.get("skills_required", [])
                        }
                    },
                    "$set": {"metadata.updated_at": completion_time}
                },
        upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to update employee profile for {employee_code}: {e}")
            # Don't fail the entire operation if profile update fails
    else:
        logger.warning(f"Skipping profile update for invalid task_id: {task_id}")
    
    # Auto-progress file tracking based on task completion (single source of truth: StageTrackingService)
    file_id = task.get("source", {}).get("permit_file_id")
    auto_progressed = False
    new_stage = None
    if file_id:
        try:
            stage_service = get_stage_tracking_service()
            before_doc = stage_service.get_file_tracking(file_id)
            before = _parse_file_tracking_safely(before_doc) if isinstance(before_doc, dict) else before_doc
            before_stage = before.current_stage.value if before and hasattr(before.current_stage, "value") else None

            after = stage_service.auto_progress_from_tasks(file_id)
            after_stage = after.current_stage.value if after and hasattr(after.current_stage, "value") else None
            auto_progressed = bool(after_stage and before_stage and after_stage != before_stage)
            new_stage = after_stage

            if auto_progressed:
                logger.info(f"Auto-progressed file {file_id} from {before_stage} to {after_stage} after task completion")
        except Exception as e:
            logger.warning(f"Failed to auto-progress file {file_id} after task completion: {e}")
    
    # Broadcast task completion via WebSocket and SSE
    try:
        from app.api.v1.routers.websocket_events import websocket_manager
        
        # For WebSocket clients (two-way)
        await websocket_manager.broadcast_task_update({
            "task_id": task_id,
            "assigned_to": employee_code,
            "stage": task.get("stage"),
            "action": "completed",
            "completed_at": completion_time.isoformat() + 'Z',
            "file_id": task.get("source", {}).get("permit_file_id"),
            "auto_progressed": auto_progressed,
            "file_new_stage": new_stage
        })
        
        # For SSE clients (one-way)
        await websocket_manager.broadcast_one_way_update("task_completed", {
            "task_id": task_id,
            "assigned_to": employee_code,
            "stage": task.get("stage"),
            "completed_at": completion_time.isoformat() + 'Z',
            "file_id": task.get("source", {}).get("permit_file_id"),
            "auto_progressed": auto_progressed,
            "file_new_stage": new_stage,
            "timestamp": completion_time.isoformat()
        })
        
        # Sync to ClickHouse for analytics
        try:
            from app.services.sync_service import sync_service
            await sync_service.sync_task_completion(task_id, employee_code)
        except Exception as e:
            logger.warning(f"Failed to sync to ClickHouse: {e}")
        
    except Exception as e:
        logger.warning(f"Failed to broadcast task completion: {e}")
    
    return {
        "success": True,
        "message": "Task completed successfully",
        "task_id": task_id,
        "completed_at": completion_time.isoformat() + 'Z',
        "auto_progressed": auto_progressed,
        "file_new_stage": new_stage
    }

@router.post("/{task_id}/recommendations")
async def get_task_recommendations(task_id: str, top_k: int = 5):
    """Get employee recommendations for a task using embeddings"""
    db = get_db()
    
    # Get task with embedding
    task = db.tasks.find_one({"task_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_embedding = task["embeddings"]["description_embedding"]
    
    # Get all employees with embeddings
    employees = list(db.employee.find({
        "embeddings.profile_embedding": {"$exists": True}
    }))
    
    recommendations = []
    
    for emp in employees:
        emp_embedding = emp["embeddings"]["profile_embedding"]
        
        # Calculate cosine similarity
        similarity = np.dot(task_embedding, emp_embedding) / (
            np.linalg.norm(task_embedding) * np.linalg.norm(emp_embedding)
        )
        
        recommendations.append({
            "employee_code": emp["employee_code"],
            "employee_name": emp["employee_name"],
            "similarity_score": float(similarity),
            "match_percentage": int(similarity * 100),
            "current_role": emp["employment"]["current_role"],
            "technical_skills": emp["skills"]["technical_skills"][:200],
            "shift": emp["employment"]["shift"],
            "status": emp["employment"]["status_1"]
        })
    
    # Sort by similarity
    recommendations.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    return {
        "task_id": task_id,
        "recommendations": recommendations[:top_k]
    }

@router.get("/employee/{employee_code}/stats")
async def get_employee_task_stats(employee_code: str):
    """Get task statistics for an employee"""
    db = get_db()
    
    # Get all tasks for the employee
    assigned_tasks = list(db.tasks.find({"assigned_to": employee_code}))
    
    # Calculate statistics
    total_assigned = len(assigned_tasks)
    completed_tasks = [t for t in assigned_tasks if t.get("status") == "COMPLETED"]
    total_completed = len(completed_tasks)
    
    # Calculate total time taken for completed tasks
    total_hours = 0
    for task in completed_tasks:
        if task.get("assigned_at") and task.get("completed_at"):
            try:
                # Handle different date formats
                assigned_at = task["assigned_at"]
                completed_at = task["completed_at"]
                
                # Parse assigned_at
                if isinstance(assigned_at, str):
                    if assigned_at.endswith('Z'):
                        assigned_time = datetime.fromisoformat(assigned_at.replace('Z', '+00:00'))
                    else:
                        assigned_time = datetime.fromisoformat(assigned_at)
                elif isinstance(assigned_at, datetime):
                    assigned_time = assigned_at
                else:
                    continue
                
                # Parse completed_at
                if isinstance(completed_at, str):
                    if completed_at.endswith('Z'):
                        completed_time = datetime.fromisoformat(completed_at.replace('Z', '+00:00'))
                    else:
                        completed_time = datetime.fromisoformat(completed_at)
                elif isinstance(completed_at, datetime):
                    completed_time = completed_at
                else:
                    continue
                
                hours = (completed_time - assigned_time).total_seconds() / 3600
                total_hours += hours
            except Exception as e:
                # Skip if date parsing fails
                continue
    
    # Get recent tasks (last 5)
    recent_tasks = sorted(assigned_tasks, 
                         key=lambda x: x.get("assigned_at", ""), 
                         reverse=True)[:5]
    
    # Format dates for recent tasks
    for task in recent_tasks:
        if task.get("assigned_at") and isinstance(task["assigned_at"], datetime):
            task["assigned_at"] = task["assigned_at"].isoformat() + 'Z'
        if task.get("completed_at") and isinstance(task["completed_at"], datetime):
            task["completed_at"] = task["completed_at"].isoformat() + 'Z'
    
    return {
        "employee_code": employee_code,
        "total_assigned": total_assigned,
        "total_completed": total_completed,
        "pending_tasks": total_assigned - total_completed,
        "completion_rate": round((total_completed / total_assigned * 100), 2) if total_assigned > 0 else 0,
        "total_hours_worked": round(total_hours, 2),
        "average_hours_per_task": round(total_hours / total_completed, 2) if total_completed > 0 else 0,
        "recent_tasks": [
            {
                "task_id": t.get("task_id"),
                "title": t.get("title"),
                "status": t.get("status"),
                "assigned_at": t.get("assigned_at"),
                "completed_at": t.get("completed_at")
            } for t in recent_tasks
        ]
    }

@router.post("/assign-qa")
async def assign_quality_assurance(file_id: str, employee_code: str, assigned_by: str = "manual"):
    """Assign file for Quality Assurance (only from COMPLETED stage)"""
    db = get_db()
    
    try:
        # First verify file is in COMPLETED stage
        service = get_stage_tracking_service()
        tracking = service.get_file_tracking(file_id)
        
        if not tracking:
            raise HTTPException(status_code=404, detail=f"File {file_id} not found")
        
        current_stage = tracking.get("current_stage")
        if current_stage != "COMPLETED":
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot assign QA - file is in {current_stage} stage, must be in COMPLETED stage"
            )
        
        # Get employee details
        employee = db.employee.find_one({"employee_code": employee_code})
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        # Create QA task
        qa_task_data = {
            "task_id": f"TASK-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}",
            "task_title": f"QA Review - {file_id}",
            "task_description": f"Quality assurance review for completed file {file_id}",
            "skills_required": ["QUALITY", "REVIEW", "ANALYSIS"],
            "workflow_step": "QUALITY_ASSURANCE",
            "estimated_hours": 2,
            "priority": "high",
            "assigned_to": employee_code,
            "assigned_to_name": employee["employee_name"],
            "assigned_by": assigned_by,
            "assigned_at": datetime.utcnow(),
            "status": "ASSIGNED",
            "file_id": file_id,
            "created_at": datetime.utcnow(),
            "metadata": {
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "qa_assignment": True
            }
        }
        
        # Insert QA task
        db.tasks.insert_one(qa_task_data)
        
        # Update employee profile
        db.profile_building.update_one(
            {"employee_code": employee_code},
            {
                "$push": {
                    "current_tasks": {
                        "task_id": qa_task_data["task_id"],
                        "task_title": qa_task_data["task_title"],
                        "assigned_at": qa_task_data["assigned_at"].isoformat() + 'Z',
                        "status": "ASSIGNED"
                    }
                },
                "$set": {"metadata.updated_at": datetime.utcnow()}
            },
            upsert=True
        )
        
        return {
            "success": True,
            "message": f"QA task assigned successfully to {employee['employee_name']}",
            "qa_task_id": qa_task_data["task_id"],
            "file_id": file_id,
            "employee_code": employee_code,
            "employee_name": employee["employee_name"],
            "assigned_at": qa_task_data["assigned_at"].isoformat() + 'Z'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"QA assignment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"QA assignment failed: {str(e)}")


# Automation endpoint for frontend integration
class AutomationRequest(BaseModel):
    file_id: str
    filename: str
    project_name: str = "Automated Project"
    client_name: str = "Client"
    priority: str = "normal"
    team_lead_id: str = None  # Team lead for employee filtering
    requirements: Dict[str, Any] = {}

@router.post("/start-automation")
async def start_automation(request: AutomationRequest):
    """Start automation workflow for a file"""
    try:
        from clients.workflow_client import workflow_client
        
        # Connect to Temporal
        await workflow_client.connect()
        
        # Start workflow
        workflow_id = await workflow_client.start_file_workflow({
            "file_id": request.file_id,
            "filename": request.filename,
            "project_name": request.project_name,
            "client_name": request.client_name,
            "priority": request.priority,
            "team_lead_id": request.team_lead_id,  # Pass team lead for filtering
            "requirements": request.requirements or {
                "skills_needed": ["review", "analysis"],
                "estimated_hours": {"prelims": 2, "production": 4, "quality": 1}
            }
        })
        
        logger.info(f"Automation started for {request.file_id}: {workflow_id}")
        
        return {
            "success": True,
            "message": "Automation workflow started",
            "workflow_id": workflow_id,
            "file_id": request.file_id
        }
        
    except Exception as e:
        logger.error(f"Failed to start automation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to start automation: {str(e)}")
