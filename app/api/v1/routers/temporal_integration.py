"""
Temporal Integration Router
Backend endpoints that bridge React UI with Temporal workflows
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional
import asyncio
import sys
import os

print("🔥 Loading temporal_integration router...")

# Add temporal_workflows to path
sys.path.append('/home/user/smart_task_assignee/task_recommend/temporal_workflows')
from clients.workflow_client import workflow_client

router = APIRouter()

@router.get("/test")
async def test():
    return {"message": "temporal_integration is working"}

class FileUploadRequest(BaseModel):
    file_id: str
    filename: str
    project_name: str
    client_name: str
    priority: str = "normal"
    requirements: Dict[str, Any] = {}

class StageCompletionRequest(BaseModel):
    file_id: str
    stage: str
    employee_code: str
    quality_score: float = 0.0

class SLABreachRequest(BaseModel):
    file_id: str
    stage: str
    employee_code: str

@router.post("/start-workflow")
async def start_file_workflow(request: FileUploadRequest):
    """
    Start Temporal workflow for uploaded file
    Called by backend after file upload
    """
    try:
        # Ensure connected to Temporal
        if not workflow_client.client:
            await workflow_client.connect()
        
        # Start workflow
        workflow_id = await workflow_client.start_file_workflow(request.dict())
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "message": "Workflow started successfully"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/complete-stage")
async def complete_stage(request: StageCompletionRequest):
    """
    Signal stage completion to Temporal
    Called when employee marks task complete
    """
    try:
        await workflow_client.signal_stage_completion(
            request.file_id,
            request.stage,
            request.employee_code,
            request.quality_score
        )
        
        return {
            "success": True,
            "message": f"Stage {request.stage} completion signaled"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sla-breach")
async def notify_sla_breach(request: SLABreachRequest):
    """
    Signal SLA breach to Temporal
    Called by monitoring system
    """
    try:
        await workflow_client.signal_sla_breach(
            request.file_id,
            request.stage,
            request.employee_code
        )
        
        return {
            "success": True,
            "message": "SLA breach signaled"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflow-state/{file_id}")
async def get_workflow_state(file_id: str):
    """
    Get current workflow state for frontend
    Maps Temporal state to business state
    """
    try:
        state = await workflow_client.get_workflow_state(file_id)
        
        if "error" in state:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Map to business-friendly response
        business_response = {
            "file_id": file_id,
            "current_stage": state["current_stage"],
            "business_state": _map_to_business_state(state["business_state"]),
            "stages_completed": state["stages_completed"],
            "sla_status": state["sla_status"],
            "workflow_id": state["workflow_id"]
        }
        
        return business_response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cancel-workflow/{file_id}")
async def cancel_workflow(file_id: str, reason: str = "Manual cancellation"):
    """
    Cancel workflow (manual override)
    """
    try:
        await workflow_client.cancel_workflow(file_id, reason)
        
        return {
            "success": True,
            "message": "Workflow cancelled"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/file-status/{file_id}")
async def get_file_status(file_id: str):
    """
    Get comprehensive file status for frontend UI
    Includes all stage information, assignments, timings
    """
    try:
        # Get workflow state
        workflow_state = await workflow_client.get_workflow_state(file_id)
        
        # Get detailed stage information from MongoDB
        stage_details = await _get_stage_details_from_db(file_id)
        
        return {
            "file_id": file_id,
            "current_stage": workflow_state.get("current_stage"),
            "business_state": _map_to_business_state(workflow_state.get("business_state", {})),
            "stages": stage_details,
            "sla_status": workflow_state.get("sla_status", "within"),
            "retry_counts": workflow_state.get("business_state", {}).get("retry_counts", {})
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _map_to_business_state(workflow_state: Dict[str, Any]) -> str:
    """Map internal workflow state to business-friendly state"""
    current_stage = workflow_state.get("current_stage")
    
    if not current_stage:
        return "WAITING_FOR_FILE"
    
    state_map = {
        "PRELIMS": "PRELIMS_IN_PROGRESS",
        "PRODUCTION": "PRODUCTION_IN_PROGRESS", 
        "QUALITY": "QUALITY_IN_PROGRESS",
        "DELIVERED": "DELIVERED",
        "SLA_BREACHED": "SLA_BREACHED",
        "REASSIGNED": "REASSIGNED"
    }
    
    return state_map.get(current_stage, "UNKNOWN")

async def _get_stage_details_from_db(file_id: str) -> Dict[str, Any]:
    """Get detailed stage information from MongoDB"""
    # This would query your existing stage_tracking collection
    # For now, return mock structure
    return {
        "PRELIMS": {
            "employee_code": "1030",
            "employee_name": "John Doe",
            "start_time": "2025-01-14T10:00:00Z",
            "completion_time": "2025-01-14T12:30:00Z",
            "duration_minutes": 150,
            "sla_status": "within",
            "quality_score": 95.0
        },
        "PRODUCTION": {
            "employee_code": "1045",
            "employee_name": "Jane Smith",
            "start_time": "2025-01-14T12:30:00Z",
            "completion_time": None,
            "duration_minutes": None,
            "sla_status": "pending",
            "quality_score": None
        }
    }
