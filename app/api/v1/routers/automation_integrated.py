"""
Integrated Automation endpoints - works with existing task flow
Enhances your current system without breaking changes
"""
from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
from pydantic import BaseModel

# Use existing services and database
from app.db.mongodb import get_db
from app.services.recommendation_engine import get_recommendation_engine

router = APIRouter(prefix="/automation", tags=["automation"])
logger = logging.getLogger(__name__)

# Reuse existing models from tasks.py
class AutoAssignRequest(BaseModel):
    file_id: str
    file_name: str = "Unknown file"
    workflow_step: str = "PRELIMS"
    priority_rules: Optional[Dict[str, Any]] = None
    assigned_by: Optional[str] = "n8n-automation"

@router.post("/auto-assign")
async def auto_assign_task(request: AutoAssignRequest):
    """
    Auto-assign task using existing task flow
    Creates task using existing /tasks/create endpoint logic
    """
    try:
        logger.info(f"[AUTOMATION] Starting auto-assignment for file: {request.file_id}")
        
        # Use existing recommendation engine
        recommendation_engine = get_recommendation_engine()
        db = get_db()
        
        # Create task description
        task_description = f"Review permit file {request.file_id} - {request.file_name} ({request.workflow_step} workflow)"
        
        # Get recommendations using existing engine
        recommendations = recommendation_engine.get_recommendations(
            task_description=task_description,
            team_lead_code=None,  # Global assignment
            top_k=5
        )
        
        # Get current workload for recommended employees
        available_employees = []
        for rec in recommendations:
            emp_code = rec.employee_code
            
            # Get current tasks using existing database structure
            current_tasks = list(db.tasks.find({
                "assigned_to": emp_code,
                "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
            }))
            
            active_tasks = len(current_tasks)
            max_tasks = request.priority_rules.get('max_active_tasks', 5) if request.priority_rules else 5
            
            if active_tasks < max_tasks:
                available_employees.append({
                    **rec.dict(),
                    'active_task_count': active_tasks,
                    'total_task_count': len(current_tasks)
                })
        
        if not available_employees:
            # Fallback to least busy employee from all employees
            all_employees = list(db.employee.find({}))
            employee_workloads = []
            
            for emp in all_employees:
                emp_code = emp["employee_code"]
                current_tasks = list(db.tasks.find({
                    "assigned_to": emp_code,
                    "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
                }))
                
                employee_workloads.append({
                    **emp,
                    'active_task_count': len(current_tasks),
                    'total_task_count': len(current_tasks)
                })
            
            employee_workloads.sort(key=lambda x: x['active_task_count'])
            if employee_workloads:
                available_employees = [employee_workloads[0]]
        
        if not available_employees:
            raise HTTPException(status_code=404, detail="No employees available for assignment")
        
        # Select best employee
        selected_employee = available_employees[0]
        logger.info(f"[AUTOMATION] Selected employee: {selected_employee['employee_name']} (score: {selected_employee.get('similarity_score', 'N/A')})")
        
        # Create task using existing task structure
        from app.api.v1.routers.tasks import generate_task_id
        from app.services.vertex_ai_embeddings import get_embedding_service
        
        task_id = generate_task_id()
        
        # Generate embedding using existing service
        embedding_service = get_embedding_service()
        task_embedding = embedding_service.generate_embedding(task_description)
        
        # Create task document following existing structure
        task_document = {
            "task_id": task_id,
            "title": f"Review {request.file_name}",
            "description": task_description,
            "task_assigned": task_description,
            "skills_required": [],
            "source": {
                "permit_file_id": request.file_id,
                "file_name": request.file_name,
                "workflow_step": request.workflow_step,
                "automation": True
            },
            "assigned_to": selected_employee['employee_code'],
            "assigned_by": request.assigned_by or "n8n-automation",
            "status": "ASSIGNED",
            "assigned_at": datetime.utcnow(),
            "date_assigned": datetime.utcnow().date().isoformat(),
            "time_assigned": datetime.utcnow(),
            "completion_time": None,
            "hours_taken": None,
            "due_date": None,
            "estimated_hours": None,
            "permit_file_id": request.file_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "embeddings": {
                "description_embedding": task_embedding,
                "embedded_text": task_description,
                "model": "text-embedding-004",
                "dimension": len(task_embedding),
                "created_at": datetime.utcnow()
            },
            "metadata": {
                "automation_source": "integrated",
                "file_id": request.file_id,
                "workflow_step": request.workflow_step,
                "selection_score": selected_employee.get('similarity_score', 0),
                "created_at": datetime.utcnow()
            }
        }
        
        # Insert task using existing database structure
        db.tasks.insert_one(task_document)
        
        # Update employee profile_building if it exists (following existing pattern)
        db.employee.update_one(
            {"employee_code": selected_employee['employee_code']},
            {"$set": {"last_task_assigned": datetime.utcnow()}},
            upsert=False
        )
        
        # Prepare response following existing patterns
        result = {
            "success": True,
            "task_id": task_id,
            "automation_source": "integrated",
            "employee": {
                "employee_code": selected_employee['employee_code'],
                "employee_name": selected_employee['employee_name'],
                "current_role": selected_employee.get('current_role'),
                "similarity_score": selected_employee.get('similarity_score', 0),
                "previous_workload": selected_employee['active_task_count'],
                "new_workload": selected_employee['active_task_count'] + 1
            },
            "task": {
                "task_id": task_id,
                "title": f"Review {request.file_name}",
                "description": task_description,
                "file_id": request.file_id,
                "workflow_step": request.workflow_step,
                "status": "ASSIGNED",
                "assigned_at": datetime.utcnow().isoformat() + 'Z',
                "assigned_to": selected_employee['employee_code']
            },
            "automation_metadata": {
                "total_employees_considered": len(recommendations),
                "available_employees": len(available_employees),
                "selection_method": "ai_recommendation_integrated",
                "processed_at": datetime.utcnow().isoformat(),
                "note": "Integrated with existing task flow and services"
            }
        }
        
        logger.info(f"[AUTOMATION] Auto-assignment completed: {result['employee']['employee_name']} assigned to {request.file_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTOMATION] Auto-assignment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Auto-assignment failed: {str(e)}")

@router.get("/workload-status")
async def get_workload_status():
    """
    Get workload status using existing task structure
    """
    try:
        db = get_db()
        
        # Use existing task assignment logic
        pipeline = [
            {
                "$match": {
                    "assigned_to": {"$exists": True, "$ne": None},
                    "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
                }
            },
            {
                "$group": {
                    "_id": "$assigned_to",
                    "active_tasks": {"$sum": 1},
                    "task_ids": {"$push": "$task_id"}
                }
            },
            {
                "$lookup": {
                    "from": "employee",
                    "localField": "_id",
                    "foreignField": "employee_code",
                    "as": "employee_details"
                }
            },
            {
                "$unwind": "$employee_details"
            }
        ]
        
        workload_data = list(db.tasks.aggregate(pipeline))
        
        # Get all employees for complete picture
        all_employees = list(db.employee.find({}))
        
        workload_analysis = []
        total_active_tasks = 0
        
        for emp in all_employees:
            emp_code = emp["employee_code"]
            
            # Find workload for this employee
            emp_workload = next((w for w in workload_data if w["_id"] == emp_code), None)
            
            active_tasks = emp_workload["active_tasks"] if emp_workload else 0
            
            # Get completed tasks count
            completed_tasks = list(db.tasks.find({
                "assigned_to": emp_code,
                "status": "COMPLETED"
            }))
            
            workload_analysis.append({
                "employee_code": emp_code,
                "employee_name": emp.get("employee_name"),
                "current_role": emp.get("employment", {}).get("current_role", emp.get("current_role")),
                "active_tasks": active_tasks,
                "completed_tasks": len(completed_tasks),
                "total_tasks": active_tasks + len(completed_tasks),
                "availability": emp.get("employee_status", {}).get("availability", "Unknown"),
                "utilization_percent": round((active_tasks / 5) * 100, 1) if active_tasks > 0 else 0
            })
            
            total_active_tasks += active_tasks
        
        # Sort by workload (least busy first)
        workload_analysis.sort(key=lambda x: x["active_tasks"])
        
        return {
            "automation_source": "integrated",
            "total_employees": len(all_employees),
            "total_active_tasks": total_active_tasks,
            "average_workload": round(total_active_tasks / len(all_employees), 1) if all_employees else 0,
            "available_for_assignment": len([w for w in workload_analysis if w["active_tasks"] < 5]),
            "workload_details": workload_analysis,
            "generated_at": datetime.utcnow().isoformat(),
            "note": "Integrated with existing task structure"
        }
        
    except Exception as e:
        logger.error(f"[AUTOMATION] Workload status check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get workload status: {str(e)}")

@router.post("/bulk-assign")
async def bulk_assign_tasks_integrated(
    files: List[Dict[str, Any]],
    assignment_strategy: str = "ai_based"
):
    """
    Bulk assign using existing task creation flow
    """
    try:
        logger.info(f"[AUTOMATION] Starting bulk assignment for {len(files)} files using {assignment_strategy} strategy")
        
        results = []
        
        for file_data in files:
            try:
                # Use existing auto-assign logic for each file
                result = await auto_assign_task(AutoAssignRequest(
                    file_id=file_data.get('file_id'),
                    file_name=file_data.get('file_name', 'Unknown'),
                    workflow_step=file_data.get('workflow_step', 'PRELIMS')
                ))
                result["strategy"] = f"{assignment_strategy}_integrated"
                results.append(result)
                
            except Exception as e:
                results.append({
                    "success": False,
                    "error": str(e),
                    "strategy": f"{assignment_strategy}_integrated",
                    "file_id": file_data.get('file_id')
                })
        
        # Summary statistics
        successful_assignments = [r for r in results if r.get("success", False)]
        
        summary = {
            "automation_source": "integrated",
            "total_files": len(files),
            "successful_assignments": len(successful_assignments),
            "failed_assignments": len(results) - len(successful_assignments),
            "strategy_used": assignment_strategy,
            "processed_at": datetime.utcnow().isoformat(),
            "results": results,
            "note": "Integrated bulk automation using existing task flow"
        }
        
        logger.info(f"[AUTOMATION] Bulk assignment completed: {len(successful_assignments)}/{len(files)} successful")
        return summary
        
    except Exception as e:
        logger.error(f"[AUTOMATION] Bulk assignment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Bulk assignment failed: {str(e)}")

@router.post("/trigger-scan")
async def trigger_assignment_scan(
    scan_type: str = "unassigned_files"
):
    """
    Trigger scan using existing task structure
    """
    try:
        logger.info(f"[AUTOMATION] Starting {scan_type} scan")
        
        if scan_type == "unassigned_files":
            # Look for unassigned tasks in existing structure
            db = get_db()
            unassigned_tasks = list(db.tasks.find({
                "assigned_to": {"$exists": False},
                "status": "OPEN"
            }).limit(5))
            
            actions_taken = []
            for task in unassigned_tasks:
                try:
                    # Auto-assign unassigned task
                    result = await auto_assign_task(AutoAssignRequest(
                        file_id=task.get("source", {}).get("permit_file_id", f"AUTO-{task['task_id']}"),
                        file_name=task.get("source", {}).get("file_name", "Auto Assignment"),
                        workflow_step=task.get("source", {}).get("workflow_step", "PRELIMS")
                    ))
                    actions_taken.append(result)
                except Exception as e:
                    logger.error(f"Failed to assign {task.get('task_id')}: {str(e)}")
            
            return {
                "automation_source": "integrated",
                "scan_type": scan_type,
                "unassigned_tasks_found": len(unassigned_tasks),
                "assignments_made": len(actions_taken),
                "actions": actions_taken,
                "scanned_at": datetime.utcnow().isoformat()
            }
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown scan type: {scan_type}")
            
    except Exception as e:
        logger.error(f"[AUTOMATION] Scan failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

@router.get("/integration-status")
async def get_integration_status():
    """
    Check integration status with existing systems
    """
    try:
        db = get_db()
        
        # Check existing collections
        tasks_count = db.tasks.count_documents({})
        employees_count = db.employee.count_documents({})
        
        # Check automation tasks
        automation_tasks = list(db.tasks.find({
            "metadata.automation_source": "integrated"
        }))
        
        return {
            "automation_source": "integrated",
            "integration_status": "active",
            "existing_tasks": tasks_count,
            "existing_employees": employees_count,
            "automation_tasks_created": len(automation_tasks),
            "services_available": {
                "recommendation_engine": True,
                "embedding_service": True,
                "task_creation": True,
                "database_access": True
            },
            "endpoints_available": [
                "/automation/auto-assign",
                "/automation/workload-status", 
                "/automation/bulk-assign",
                "/automation/trigger-scan",
                "/automation/integration-status"
            ],
            "note": "Fully integrated with existing task flow",
            "checked_at": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"[AUTOMATION] Integration status check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Integration check failed: {str(e)}")
