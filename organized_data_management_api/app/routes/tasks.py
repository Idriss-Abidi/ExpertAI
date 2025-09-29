"""
Task management API endpoints
"""

from fastapi import APIRouter, HTTPException, status
from typing import List

from ..models.base import TaskStatus
from ..utils.helpers import get_task_status, list_tasks, delete_task

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/{task_id}")
async def get_task_status_endpoint(task_id: str):
    """Get task status by ID"""
    task = get_task_status(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )
    
    return task


@router.get("")
async def list_tasks_endpoint():
    """List all tasks"""
    return list_tasks()


@router.delete("/{task_id}")
async def delete_task_endpoint(task_id: str):
    """Delete a task"""
    if not delete_task(task_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found"
        )
    
    return {"message": f"Task {task_id} deleted successfully"}
