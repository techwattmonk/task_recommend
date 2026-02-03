"""
Standalone Automation endpoints for n8n workflows
Works independently without affecting existing code flow
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
from pydantic import BaseModel

# Use existing database connection without modifying existing services
from app.db.mongodb import get_db

router = APIRouter(prefix="/automation", tags=["automation"])
logger = logging.getLogger(__name__)

class AutoAssignRequest(BaseModel):
    file_id: str
    file_name: str = "Unknown file"
    workflow_step: str = "PRELIMS"
    priority_rules: Optional[Dict[str, Any]] = None

@router.post("/auto-assign")
async def auto_assign_task(request: AutoAssignRequest):
    """
    Standalone auto-assignment that doesn't interfere with existing code
    Uses direct database access to avoid conflicts with existing services
    """
    try:
        logger.info(f"[STANDALONE] Starting auto-assignment for file: {request.file_id}")
        
        # Extract task information
        file_id = request.file_id
        file_name = request.file_name
        workflow_step = request.workflow_step
        priority_rules = request.priority_rules
        
        # Create task description
        task_description = f"Review permit file {file_id} - {file_name} ({workflow_step} workflow)"
        
        # Get all employees using direct database access
        db = get_db()
        all_employees = list(db.employee.find({}))
        
        if not all_employees:
            raise HTTPException(status_code=404, detail="No employees found")
        
        # Simple workload analysis without using existing services
        available_employees = []
        for emp in all_employees:
            emp_code = emp["employee_code"]
            
            # Get current tasks directly from database
            current_tasks = list(db.tasks.find({
                "employee_code": emp_code,
                "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
            }))
            
            active_tasks = len(current_tasks)
            max_tasks = priority_rules.get('max_active_tasks', 5) if priority_rules else 5
            
            if active_tasks < max_tasks:
                available_employees.append({
                    **emp,
                    'active_task_count': active_tasks,
                    'total_task_count': len(current_tasks),
                    'current_tasks': current_tasks
                })
        
        if not available_employees:
            raise HTTPException(status_code=404, detail="No employees available for assignment")
        
        # Sort by workload (least busy first)
        available_employees.sort(key=lambda x: x['active_task_count'])
        
        # Select best employee (simple workload-based selection)
        selected_employee = available_employees[0]
        logger.info(f"[STANDALONE] Selected employee: {selected_employee['employee_name']} (workload: {selected_employee['active_task_count']})")
        
        # Create the task assignment using direct database insertion
        task_id = f"AUTO-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        assigned_by = 'n8n-automation-standalone'
        
        task_document = {
            "task_id": task_id,
            "employee_code": selected_employee['employee_code'],
            "employee_name": selected_employee['employee_name'],
            "task_description": task_description,
            "task_assigned": task_description,
            "status": "ASSIGNED",
            "assigned_at": datetime.now().isoformat(),
            "time_assigned": datetime.now().strftime('%H:%M:%S'),
            "date_assigned": datetime.now().strftime('%Y-%m-%d'),
            "assigned_by": assigned_by,
            "file_id": file_id,
            "workflow_step": workflow_step,
            "priority": priority_rules.get('priority', 'NORMAL') if priority_rules else 'NORMAL',
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "automation_source": "standalone"  # Mark as automation-created
        }
        
        # Insert task into database
        db.tasks.insert_one(task_document)
        
        # Prepare response
        result = {
            "success": True,
            "assignment_id": task_id,
            "automation_source": "standalone",
            "employee": {
                "employee_code": selected_employee['employee_code'],
                "employee_name": selected_employee['employee_name'],
                "current_role": selected_employee.get('current_role'),
                "previous_workload": selected_employee['active_task_count'],
                "new_workload": selected_employee['active_task_count'] + 1
            },
            "task": {
                "task_id": task_id,
                "description": task_description,
                "file_id": file_id,
                "workflow_step": workflow_step,
                "status": "ASSIGNED",
                "assigned_at": datetime.now().isoformat(),
                "priority": priority_rules.get('priority', 'NORMAL') if priority_rules else 'NORMAL'
            },
            "automation_metadata": {
                "total_employees_considered": len(all_employees),
                "available_employees": len(available_employees),
                "selection_method": "workload_based_standalone",
                "processed_at": datetime.now().isoformat(),
                "note": "Standalone automation - no interference with existing code"
            }
        }
        
        logger.info(f"[STANDALONE] Auto-assignment completed: {result['employee']['employee_name']} assigned to {file_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STANDALONE] Auto-assignment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Auto-assignment failed: {str(e)}")

@router.get("/workload-status")
async def get_workload_status():
    """
    Standalone workload status that doesn't interfere with existing systems
    """
    try:
        db = get_db()
        
        # Get all employees
        all_employees = list(db.employee.find({}))
        
        # Analyze workload using direct database queries
        workload_analysis = []
        total_active_tasks = 0
        
        for emp in all_employees:
            emp_code = emp["employee_code"]
            
            # Get current tasks directly
            active_tasks = list(db.tasks.find({
                "employee_code": emp_code,
                "status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}
            }))
            
            completed_tasks = list(db.tasks.find({
                "employee_code": emp_code,
                "status": "COMPLETED"
            }))
            
            active_count = len(active_tasks)
            completed_count = len(completed_tasks)
            
            workload_analysis.append({
                "employee_code": emp_code,
                "employee_name": emp.get("employee_name"),
                "current_role": emp.get("current_role"),
                "active_tasks": active_count,
                "completed_tasks": completed_count,
                "total_tasks": active_count + completed_count,
                "availability": emp.get("employee_status", {}).get("availability", "Unknown"),
                "utilization_percent": round((active_count / 5) * 100, 1) if active_count > 0 else 0
            })
            
            total_active_tasks += active_count
        
        # Sort by workload (least busy first)
        workload_analysis.sort(key=lambda x: x["active_tasks"])
        
        return {
            "automation_source": "standalone",
            "total_employees": len(all_employees),
            "total_active_tasks": total_active_tasks,
            "average_workload": round(total_active_tasks / len(all_employees), 1) if all_employees else 0,
            "available_for_assignment": len([w for w in workload_analysis if w["active_tasks"] < 5]),
            "workload_details": workload_analysis,
            "generated_at": datetime.now().isoformat(),
            "note": "Standalone automation - independent of existing systems"
        }
        
    except Exception as e:
        logger.error(f"[STANDALONE] Workload status check failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get workload status: {str(e)}")

@router.post("/trigger-scan")
async def trigger_assignment_scan(scan_type: str = "test_assignment"):
    """
    Standalone scan trigger for testing automation
    """
    try:
        logger.info(f"[STANDALONE] Starting {scan_type} scan")
        
        if scan_type == "test_assignment":
            # Create a test assignment
            test_file = {
                "file_id": f"SCAN-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "file_name": "Standalone Test Document.pdf",
                "workflow_step": "PRELIMS"
            }
            
            try:
                result = await auto_assign_task(AutoAssignRequest(**test_file))
                return {
                    "automation_source": "standalone",
                    "scan_type": scan_type,
                    "assignments_made": 1,
                    "actions": [result],
                    "scanned_at": datetime.now().isoformat(),
                    "note": "Standalone automation test completed"
                }
            except Exception as e:
                return {
                    "automation_source": "standalone",
                    "scan_type": scan_type,
                    "assignments_made": 0,
                    "error": str(e),
                    "scanned_at": datetime.now().isoformat()
                }
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown scan type: {scan_type}")
            
    except Exception as e:
        logger.error(f"[STANDALONE] Scan failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

@router.post("/bulk-assign")
async def bulk_assign_tasks_standalone(
    files: List[Dict[str, Any]],
    assignment_strategy: str = "round_robin"
):
    """
    Standalone bulk assignment that doesn't interfere with existing systems
    """
    try:
        logger.info(f"[STANDALONE] Starting bulk assignment for {len(files)} files using {assignment_strategy} strategy")
        
        results = []
        db = get_db()
        
        if assignment_strategy == "round_robin":
            # Get all employees and distribute evenly
            all_employees = list(db.employee.find({}))
            
            employee_index = 0
            for file_data in files:
                if employee_index >= len(all_employees):
                    employee_index = 0  # Reset to start
                
                selected_employee = all_employees[employee_index]
                
                # Create task directly
                try:
                    task_id = f"BULK-{datetime.now().strftime('%Y%m%d%H%M%S')}-{employee_index}"
                    task_description = f"Review permit file {file_data.get('file_id')} - {file_data.get('file_name', 'Unknown')}"
                    
                    task_document = {
                        "task_id": task_id,
                        "employee_code": selected_employee['employee_code'],
                        "employee_name": selected_employee['employee_name'],
                        "task_description": task_description,
                        "status": "ASSIGNED",
                        "assigned_at": datetime.now().isoformat(),
                        "assigned_by": "n8n-bulk-standalone",
                        "file_id": file_data.get('file_id'),
                        "automation_source": "standalone_bulk"
                    }
                    
                    db.tasks.insert_one(task_document)
                    
                    results.append({
                        "success": True,
                        "task_id": task_id,
                        "employee_name": selected_employee['employee_name'],
                        "strategy": "round_robin_standalone"
                    })
                    
                except Exception as e:
                    results.append({"success": False, "error": str(e), "strategy": "round_robin_standalone"})
                
                employee_index += 1
        
        # Summary statistics
        successful_assignments = [r for r in results if r.get("success", False)]
        
        summary = {
            "automation_source": "standalone",
            "total_files": len(files),
            "successful_assignments": len(successful_assignments),
            "failed_assignments": len(results) - len(successful_assignments),
            "strategy_used": assignment_strategy,
            "processed_at": datetime.now().isoformat(),
            "results": results,
            "note": "Standalone bulk automation - independent of existing systems"
        }
        
        logger.info(f"[STANDALONE] Bulk assignment completed: {len(successful_assignments)}/{len(files)} successful")
        return summary
        
    except Exception as e:
        logger.error(f"[STANDALONE] Bulk assignment failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Bulk assignment failed: {str(e)}")
