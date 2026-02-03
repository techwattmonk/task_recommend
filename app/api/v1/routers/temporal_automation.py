"""
Temporal Automation Router
Handles integration between frontend and Temporal workflows
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import asyncio
import logging
import sys
import os

# Add temporal_workflows to path
sys.path.append('/home/user/smart_task_assignee/temporal_workflows')

from temporalio.client import Client

logger = logging.getLogger(__name__)

router = APIRouter()

class FileProgressionRequest(BaseModel):
    file_id: str
    filename: str
    project_name: str
    client_name: str
    priority: str = "normal"
    requirements: Dict[str, Any]

class TaskAssignmentRequest(BaseModel):
    task_id: str
    workflow_step: str
    skills_required: List[str]
    priority: str = "normal"

@router.post("/trigger-progression")
async def trigger_file_progression(request: FileProgressionRequest):
    """
    Trigger the complete file progression workflow in Temporal
    """
    try:
        logger.info(f"Triggering progression for file: {request.file_id}")
        
        # Connect to Temporal client
        client = await Client.connect("localhost:7233")
        
        # Execute the file progression workflow
        result = await client.execute_workflow(
            "FileProgressionWorkflow",
            request.dict(),
            id=f"progression-{request.file_id}-{datetime.now().timestamp()}",
            task_queue="file-progression-queue",
            run_timeout=timedelta(hours=24)
        )
        
        logger.info(f"✅ Workflow started for file: {request.file_id}")
        
        return {
            "success": True,
            "workflow_id": f"progression-{request.file_id}-{datetime.now().timestamp()}",
            "message": "File progression workflow started successfully",
            "estimated_completion": "2-4 hours",
            "result": result
        }
        
    except Exception as e:
        logger.error(f"Error triggering progression: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/progression-status/{file_id}")
async def get_progression_status(file_id: str):
    """
    Get the current status of file progression
    """
    try:
        # Connect to Temporal client
        client = await Client.connect("localhost:7233")
        
        # Get workflow handle
        workflow_id = f"progression-{file_id}"
        handle = client.get_workflow_handle(workflow_id)
        
        # Get workflow status
        describe = await handle.describe()
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "status": describe.status.name,
            "current_stage": "Unknown",  # Would need to query workflow execution
            "started_at": describe.execution_start_time.isoformat() if describe.execution_start_time else None,
            "progress": 50 if describe.status.name == "RUNNING" else 100,
            "stages_completed": []  # Would need to query workflow execution
        }
        
    except Exception as e:
        logger.error(f"Error getting progression status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/automation-metrics")
async def get_automation_metrics():
    """
    Get overall automation performance metrics
    """
    try:
        # Connect to Temporal client
        client = await Client.connect("localhost:7233")
        
        # List completed workflows
        list_response = await client.list_workflows(
            query="WorkflowType = 'FileProgressionWorkflow' AND ExecutionStatus = 'COMPLETED'",
            page_size=100
        )
        
        completed_workflows = len(list_response.workflows)
        
        # List running workflows
        running_response = await client.list_workflows(
            query="WorkflowType = 'FileProgressionWorkflow' AND ExecutionStatus = 'RUNNING'",
            page_size=100
        )
        
        running_workflows = len(running_response.workflows)
        total_workflows = completed_workflows + running_workflows
        
        return {
            "success": True,
            "metrics": {
                "total_workflows": total_workflows,
                "completed_workflows": completed_workflows,
                "running_workflows": running_workflows,
                "average_completion_hours": 2.5,  # Would calculate from actual data
                "success_rate": (completed_workflows / total_workflows * 100) if total_workflows > 0 else 0
            },
            "recent_activity": []  # Would get from actual workflow results
        }
        
    except Exception as e:
        logger.error(f"Error getting automation metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/smart-assign")
async def smart_task_assignment(request: TaskAssignmentRequest):
    """
    Get AI-powered task assignment recommendation
    """
    try:
        # Call existing Gemini API for recommendations
        import requests
        
        response = requests.post(
            "http://localhost:8000/api/v1/gemini/recommend",
            json={
                "task_type": request.workflow_step,
                "skills_required": request.skills_required,
                "workflow_step": request.workflow_step,
                "priority": request.priority
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                "success": True,
                "recommendations": data.get("recommendations", [])
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to get recommendations")
            
    except Exception as e:
        logger.error(f"Error in smart assignment: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/workflow-history")
async def get_workflow_history():
    """
    Get history of all completed workflows
    """
    try:
        # Connect to Temporal client
        client = await Client.connect("localhost:7233")
        
        # List completed workflows
        list_response = await client.list_workflows(
            query="WorkflowType = 'FileProgressionWorkflow' AND ExecutionStatus = 'COMPLETED'",
            page_size=50
        )
        
        workflows = []
        for workflow in list_response.workflows:
            workflows.append({
                "workflow_id": workflow.workflow_id,
                "status": workflow.execution_status.name,
                "started_at": workflow.execution_start_time.isoformat() if workflow.execution_start_time else None,
                "completed_at": workflow.close_time.isoformat() if workflow.close_time else None
            })
        
        return {
            "success": True,
            "workflows": workflows
        }
        
    except Exception as e:
        logger.error(f"Error getting workflow history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))