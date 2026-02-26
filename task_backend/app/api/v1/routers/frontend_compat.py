"""
Additional endpoints for frontend compatibility
"""
import logging
from fastapi import APIRouter, HTTPException
from app.api.v1.routers.employees import router as employees_router
from app.api.v1.routers.permit_files import router as permit_files_router
from app.api.v1.routers.tasks import router as tasks_router

logger = logging.getLogger(__name__)

# Create additional endpoints that frontend expects
router = APIRouter()

# Employees endpoints
@router.get("/employees/")
async def get_all_employees():
    """Alias for employees list - properly transformed data"""
    # Forward to actual employees router implementation
    from app.api.v1.routers.employees import get_employees
    return await get_employees()

@router.get("/employees/employees-grouped-by-team-lead")
async def get_employees_grouped_by_team_lead():
    """Get employees grouped by team lead with optimized query and error handling"""
    import logging
    from app.db.mongodb import get_db
    
    logger = logging.getLogger(__name__)
    logger.info("[EMPLOYEES-GROUPED-START] Fetching employees grouped by team lead")
    
    try:
        db = get_db()
        
        # Optimized query: Only fetch required fields to reduce data transfer
        # Add timeout and limit to prevent MongoDB timeouts
        employees = list(db.employee.find(
            {"status_1": "Permanent"},  # Only permanent employees
            {
                "_id": 0,
                "employee_code": 1,
                "employee_name": 1,
                "reporting_manager": 1,
                "current_role": 1,
                "experience_years": 1,
                "contact_email": 1,
                "status_1": 1,
                "technical_skills": 1
            }
        ).max_time_ms(10000).limit(100))  # 10 second timeout, max 100 employees
        
        logger.info(f"[EMPLOYEES-GROUPED-SUCCESS] Retrieved {len(employees)} employees")
        
        if not employees:
            logger.warning("[EMPLOYEES-GROUPED-WARNING] No employees found")
            return []
        
        # Group by reporting manager with uniform parsing
        grouped = {}
        team_lead_info = {}  # Cache team lead info to avoid repeated lookups
        
        for emp in employees:
            manager = emp.get("reporting_manager", "Unassigned")
            
            # Parse reporting_manager uniformly: "Name (Code)" -> extract name and code
            team_lead_code = manager
            team_lead_name = manager
            
            if manager and manager != "Unassigned" and "(" in manager and ")" in manager:
                import re
                match = re.match(r"(.+?)\s*\(([^)]+)\)", manager.strip())
                if match:
                    team_lead_name = match.group(1).strip()
                    team_lead_code = match.group(2).strip()
            
            # Cache team lead info
            if team_lead_code not in team_lead_info:
                team_lead_info[team_lead_code] = {
                    "team_lead_name": team_lead_name,
                    "team_lead_code": team_lead_code
                }
            
            # Initialize group if not exists
            if team_lead_code not in grouped:
                grouped[team_lead_code] = []
            
            # Add employee with consistent field names for frontend
            employee_data = {
                "employee_code": emp.get("employee_code"),
                "employee_name": emp.get("employee_name"),
                "current_role": emp.get("current_role"),
                "experience_years": emp.get("experience_years", 0),
                "contact_email": emp.get("contact_email"),
                "status": emp.get("status_1", ""),
                "skills": emp.get("technical_skills", {}),
                "reporting_manager": manager  # Keep original for reference
            }
            
            grouped[team_lead_code].append(employee_data)
        
        # Convert to array format for frontend with consistent structure
        result = []
        for team_lead_code, team_members in grouped.items():
            lead_info = team_lead_info[team_lead_code]
            
            result.append({
                "team_lead_code": lead_info["team_lead_code"],
                "team_lead_name": lead_info["team_lead_name"],
                "employees": team_members,
                "total_employees": len(team_members),
                "active_employees": len([e for e in team_members if e.get("status") == "Permanent"])
            })
        
        # Sort by team lead name for consistent ordering
        result.sort(key=lambda x: x["team_lead_name"])
        
        logger.info(f"[EMPLOYEES-GROUPED-SUCCESS] Returning {len(result)} team leads with {sum(len(r['employees']) for r in result)} total employees")
        
        return {
            "team_leads": result,
            "summary": {
                "total_team_leads": len(result),
                "total_employees": sum(len(r['employees']) for r in result),
                "unassigned_employees": len(grouped.get("Unassigned", []))
            }
        }
        
    except Exception as e:
        logger.error(f"[EMPLOYEES-GROUPED-ERROR] Failed to fetch employees grouped by team lead: {str(e)}")
        
        # Return empty result instead of crashing
        return {
            "team_leads": [],
            "summary": {
                "total_team_leads": 0,
                "total_employees": 0,
                "unassigned_employees": 0
            },
            "error": f"Failed to load employee data: {str(e)}"
        }

# Tasks endpoints
@router.get("/tasks/completed/today")
async def get_completed_tasks():
    """Get tasks completed today"""
    from app.db.mongodb import get_db
    from datetime import datetime, timedelta
    from pymongo.errors import NetworkTimeout, OperationFailure
    
    try:
        db = get_db()
        today = datetime.now().date()
        start_of_day = datetime.combine(today, datetime.min.time())
        end_of_day = datetime.combine(today, datetime.max.time())
        
        tasks = list(db.tasks.find({
            "status": "COMPLETED",
            "completed_at": {"$gte": start_of_day, "$lte": end_of_day}
        }, {"_id": 0}).max_time_ms(3000))  # 3 second timeout
        
        return tasks  # Return array directly
    except NetworkTimeout as e:
        logger.warning(f"MongoDB timeout fetching completed tasks: {str(e)}")
        return []
    except OperationFailure as e:
        logger.warning(f"MongoDB operation failed fetching completed tasks: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching completed tasks: {str(e)}")
        return []

@router.get("/tasks/recent-activity")
async def get_recent_activity():
    """Get recent task activity"""
    from app.db.mongodb import get_db
    from datetime import datetime, timedelta
    from pymongo.errors import NetworkTimeout, OperationFailure
    
    try:
        db = get_db()
        seven_days_ago = datetime.now() - timedelta(days=7)
        
        activities = list(db.tasks.find({
            "$or": [
                {"metadata.created_at": {"$gte": seven_days_ago}},
                {"assigned_at": {"$gte": seven_days_ago}}
            ]
        }, {"_id": 0}).sort("assigned_at", -1).limit(20).max_time_ms(3000))  # 3 second timeout
        
        return activities  # Return array directly
    except NetworkTimeout as e:
        logger.warning(f"MongoDB timeout fetching recent activity: {str(e)}")
        return []
    except OperationFailure as e:
        logger.warning(f"MongoDB operation failed fetching recent activity: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching recent activity: {str(e)}")
        return []

@router.get("/tasks/assigned")
async def get_assigned_tasks():
    """Get all assigned tasks"""
    from app.db.mongodb import get_db
    from pymongo.errors import NetworkTimeout, OperationFailure
    
    try:
        db = get_db()
        # Add timeout and error handling
        tasks = list(db.tasks.find({
            "status": {"$ne": "COMPLETED"}
        }, {"_id": 0}).max_time_ms(3000))  # 3 second timeout
        
        return tasks  # Return array directly
    except NetworkTimeout as e:
        logger.warning(f"MongoDB timeout fetching assigned tasks: {str(e)}")
        # Return empty array on timeout to prevent frontend crashes
        return []
    except OperationFailure as e:
        logger.warning(f"MongoDB operation failed: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching assigned tasks: {str(e)}")
        # Return empty array on error to prevent frontend crashes
        return []

# Permit files endpoints  
@router.get("/permit-files/unassigned")
async def get_unassigned_permit_files():
    """Get unassigned permit files"""
    from app.db.mongodb import get_db
    from pymongo.errors import NetworkTimeout, OperationFailure
    
    try:
        db = get_db()
        files = list(db.permit_files.find({
            "$or": [
                {"assigned_to": None},
                {"assigned_to": ""},
                {"status": "uploaded"}
            ]
        }, {"_id": 0}).max_time_ms(3000))  # 3 second timeout
        
        return files  # Return array directly, not object
    except NetworkTimeout as e:
        logger.warning(f"MongoDB timeout fetching unassigned permit files: {str(e)}")
        return []
    except OperationFailure as e:
        logger.warning(f"MongoDB operation failed fetching permit files: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching unassigned permit files: {str(e)}")
        return []
