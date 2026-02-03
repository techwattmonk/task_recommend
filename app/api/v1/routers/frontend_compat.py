"""
Additional endpoints for frontend compatibility
"""
from fastapi import APIRouter
from app.api.v1.routers.employees import router as employees_router
from app.api.v1.routers.permit_files import router as permit_files_router
from app.api.v1.routers.tasks import router as tasks_router

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
    """Get employees grouped by team lead"""
    from app.db.mongodb import get_db
    db = get_db()
    
    employees = list(db.employee.find({}, {"_id": 0}))
    
    # Group by reporting manager
    grouped = {}
    for emp in employees:
        manager = emp.get("reporting_manager", "Unassigned")
        if manager not in grouped:
            grouped[manager] = []
        grouped[manager].append(emp)
    
    # Convert to array format for frontend
    result = []
    for team_lead_code, team_members in grouped.items():
        # Extract team lead name from code if in format "Name (code)"
        team_lead_name = team_lead_code
        if "(" in team_lead_code and ")" in team_lead_code:
            import re
            match = re.match(r"(.+?)\s*\(([^)]+)\)", team_lead_code)
            if match:
                team_lead_name = match.group(1)
                team_lead_code = match.group(2)
        
        result.append({
            "team_lead_code": team_lead_code,
            "team_lead_name": team_lead_name,
            "employees": team_members
        })
    
    return result

# Tasks endpoints
@router.get("/tasks/completed-today")
async def get_tasks_completed_today():
    """Get tasks completed today"""
    from app.db.mongodb import get_db
    from datetime import datetime, timedelta
    
    db = get_db()
    today = datetime.now().date()
    start_of_day = datetime.combine(today, datetime.min.time())
    end_of_day = datetime.combine(today, datetime.max.time())
    
    tasks = list(db.tasks.find({
        "status": "completed",
        "completed_at": {"$gte": start_of_day, "$lte": end_of_day}
    }, {"_id": 0}))
    
    return tasks  # Return array directly

@router.get("/tasks/recent-activity")
async def get_recent_activity():
    """Get recent task activity"""
    from app.db.mongodb import get_db
    from datetime import datetime, timedelta
    
    db = get_db()
    seven_days_ago = datetime.now() - timedelta(days=7)
    
    activities = list(db.tasks.find({
        "created_at": {"$gte": seven_days_ago}
    }, {"_id": 0}).sort("created_at", -1).limit(20))
    
    return activities  # Return array directly

@router.get("/tasks/assigned")
async def get_assigned_tasks():
    """Get all assigned tasks"""
    from app.db.mongodb import get_db
    
    try:
        db = get_db()
        # Add timeout and error handling
        tasks = list(db.tasks.find({
            "status": {"$ne": "completed"}
        }, {"_id": 0}).max_time_ms(5000))  # 5 second timeout
        
        return tasks  # Return array directly
    except Exception as e:
        logger.error(f"Error fetching assigned tasks: {str(e)}")
        # Return empty array on error to prevent frontend crashes
        return []

# Permit files endpoints  
@router.get("/permit-files/unassigned")
async def get_unassigned_permit_files():
    """Get unassigned permit files"""
    from app.db.mongodb import get_db
    
    try:
        db = get_db()
        files = list(db.permit_files.find({
            "$or": [
                {"assigned_to": None},
                {"assigned_to": ""},
                {"status": "uploaded"}
            ]
        }, {"_id": 0}).max_time_ms(5000))  # 5 second timeout
        
        return files  # Return array directly, not object
    except Exception as e:
        logger.error(f"Error fetching unassigned permit files: {str(e)}")
        return []
