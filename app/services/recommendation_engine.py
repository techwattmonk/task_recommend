"""
Updated Recommendation Engine for Employee Task Assignment
- Works with new Excel-based structure
- Uses task-aware embeddings (skills + previous tasks)
- Fast recommendations with pre-computed embeddings
"""

from typing import List, Dict, Any, Optional
import numpy as np
from datetime import datetime, timedelta
from pydantic import BaseModel
import re
import logging

from app.db.mongodb import get_db
from app.services.vertex_ai_embeddings import VertexAIEmbeddingService
from app.services.skill_normalizer import SkillNormalizer
from app.services.stage_assignment_service import StageAssignmentService
from app.models.stage_flow import FileStage

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class EmployeeRecommendation(BaseModel):
    """Employee recommendation model"""
    employee_code: str
    employee_name: str
    similarity_score: float
    match_percentage: int
    current_role: str
    shift: str
    experience_years: float
    availability: str
    reasoning: str
    skills_match: Dict[str, List[str]]
    task_relevance: str
    current_tasks: List[Dict[str, Any]] = []
    active_task_count: int = 0
    total_task_count: int = 0

class RecommendationEngine:
    """Enhanced recommendation engine with task awareness"""
    
    def __init__(self):
        self.db = get_db()
        self.embedding_service = VertexAIEmbeddingService()
        self.skill_normalizer = SkillNormalizer()
        self._employee_cache = {}
        self._cache_timestamp = None
        self._cache_ttl = 300  # 5 minutes
    
    # ===================== LOAD EMPLOYEES =====================
    
    def load_employees(self, team_lead_code: Optional[str] = None):
        """Load employees with new structure and current task information"""
        cache_key = team_lead_code or "ALL"

        if cache_key in self._employee_cache and self._cache_valid():
            return self._employee_cache[cache_key]
        
        # Build query based on team lead
        query: Dict[str, Any] = {"status_1": "Permanent"}
        if team_lead_code:
            team_lead_code_stripped = team_lead_code.strip()
            # Support both "0079" and "Name (0079)" formats
            match = re.search(r"\(([^)]+)\)", team_lead_code_stripped)
            extracted_code = match.group(1).strip() if match else None

            patterns: List[str] = []
            if extracted_code:
                patterns.append(re.escape(extracted_code))
            patterns.append(re.escape(team_lead_code_stripped))

            query["reporting_manager"] = {"$regex": "|".join(patterns), "$options": "i"}

        # Include employees even if embeddings are missing (team-level data often lacks embeddings).
        employees = list(self.db.employee.find(
            query,
            {
                "_id": 0,
                "skills": 1,
                "technical_skills": 1,
                "raw_technical_skills": 1,
                "raw_strength_expertise": 1,
                "employee_code": 1,
                "employee_name": 1,
                "current_role": 1,
                "shift": 1,
                "experience_years": 1,
                "status_1": 1,
                "reporting_manager": 1,
                "List of task assigned": 1,
                "Special Task": 1,
                "embedding": 1,
            }
        ))
        
        # Load current tasks for all employees
        employee_codes = [emp.get("employee_code") for emp in employees]
        current_tasks = self._load_current_tasks(employee_codes)
        
        # Attach task information to each employee
        for emp in employees:
            emp_code = emp.get("employee_code")
            emp["current_tasks"] = current_tasks.get(emp_code, [])
            emp["active_task_count"] = len([t for t in current_tasks.get(emp_code, []) if t.get("status") == "ASSIGNED"])
            emp["total_task_count"] = len(current_tasks.get(emp_code, []))
        
        self._employee_cache[cache_key] = employees
        self._cache_timestamp = datetime.utcnow()

        return employees
    
    def _load_current_tasks(self, employee_codes: List[str]) -> Dict[str, List[Dict]]:
        """Load current tasks for the given employee codes"""
        if not employee_codes:
            return {}
        
        # Get all tasks for these employees (both active and completed)
        tasks = list(self.db.tasks.find(
            {
                "assigned_to": {"$in": employee_codes}
            },
            {
                "_id": 0,
                "task_id": 1,
                "title": 1,
                "description": 1,
                "assigned_to": 1,
                "status": 1,
                "assigned_at": 1,
                "due_date": 1,
                "skills_required": 1
            }
        ).sort("assigned_at", -1))  # Most recent first
        
        # Group tasks by employee
        tasks_by_employee = {}
        for task in tasks:
            emp_code = task.get("assigned_to")
            if emp_code not in tasks_by_employee:
                tasks_by_employee[emp_code] = []
            tasks_by_employee[emp_code].append(task)
        
        print(f"[DEBUG] Loaded all tasks for {len(tasks_by_employee)} employees")
        return tasks_by_employee

    def _cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if not self._cache_timestamp:
            return False
        return datetime.utcnow() - self._cache_timestamp < timedelta(seconds=self._cache_ttl)
    
    # ===================== EMBEDDINGS =====================
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for task description"""
        return self.embedding_service.generate_embedding(text)
    
    # ===================== RECOMMENDATIONS =====================
    
    def get_recommendations(
        self,
        task_description: str,
        team_lead_code: Optional[str] = None,
        top_k: int = 10,
        min_score: float = 0.3,
        file_id: Optional[str] = None,
        current_file_stage: Optional[str] = None
    ) -> List[EmployeeRecommendation]:
        """Get task recommendations using hybrid scoring (embedding + keyword matching)"""
        
        print(f"[DEBUG] Getting recommendations for: {task_description}")
        print(f"[DEBUG] Team lead: {team_lead_code}")
        print(f"[DEBUG] File ID: {file_id}, Current Stage: {current_file_stage}")
        
        # Load employees
        employees = self.load_employees(team_lead_code)
        print(f"[DEBUG] Loaded {len(employees)} employees")
        
        if not employees:
            print("[DEBUG] No employees found")
            return []
        
        # Use enhanced stage detection with context
        detected_stage = StageAssignmentService.detect_stage_from_description_with_context(
            task_description or "", file_id, current_file_stage
        )

        # PRELIMS keywords should be routed to new joinees / low experience
        if detected_stage == FileStage.PRELIMS:
            return self._prelims_priority_recommendations(employees, top_k)

        # Generate task embedding
        task_embedding = self.embed_text(task_description)
        task_embedding = np.array(task_embedding)
        task_embedding = task_embedding / np.linalg.norm(task_embedding)
        
        # Extract keywords from task description for direct matching
        task_keywords = self._extract_task_keywords(task_description)
        print(f"[DEBUG] Task keywords extracted: {task_keywords}")
        
        # Calculate similarities
        recommendations = []
        
        for emp in employees:
            # Get employee embedding
            emp_embedding = np.array(emp.get("embedding", []))
            
            # Calculate embedding similarity (if available)
            embedding_similarity = 0.0
            if len(emp_embedding) > 0:
                emp_embedding = emp_embedding / np.linalg.norm(emp_embedding)
                embedding_similarity = float(np.dot(task_embedding, emp_embedding))
            
            # Calculate keyword-based skill match score
            keyword_score = self._calculate_keyword_score(emp, task_keywords, task_description)
            print(f"[DEBUG] Employee {emp.get('employee_name')}: keyword_score={keyword_score}, embedding_similarity={embedding_similarity}")
            
            # Hybrid score: prioritize keyword matching, use embedding as secondary
            # If employee has matching skills, boost their score significantly
            if keyword_score > 0:
                # Employee has relevant skills - use keyword score as primary
                similarity = max(keyword_score, embedding_similarity, 0.3)
                print(f"[DEBUG] Employee {emp.get('employee_name')}: Using hybrid score={similarity} (keyword-based)")
            else:
                # No direct skill match - use embedding similarity
                similarity = max(embedding_similarity, 0.0)
                print(f"[DEBUG] Employee {emp.get('employee_name')}: Using embedding score={similarity}")
            
            # Skip if below threshold
            if similarity < min_score:
                print(f"[DEBUG] Employee {emp.get('employee_name')}: Score {similarity} below threshold {min_score}")
                continue
            
            # Build reasoning
            reasoning = self.build_reasoning(task_description, emp, similarity)
            
            # Create recommendation
            skills_match = self.extract_skills_match(emp)
            
            rec = EmployeeRecommendation(
                employee_code=emp.get("employee_code"),
                employee_name=emp.get("employee_name"),
                similarity_score=round(similarity, 3),
                match_percentage=int(similarity * 100),
                current_role=emp.get("current_role", "Not specified"),
                shift=emp.get("shift", "Day"),
                experience_years=emp.get("experience_years", 0),
                availability="ACTIVE" if emp.get("status_1") == "Permanent" else "INACTIVE",
                reasoning=reasoning,
                skills_match=skills_match,
                task_relevance=self.extract_task_relevance(emp, task_description),
                current_tasks=emp.get("current_tasks", []),
                active_task_count=emp.get("active_task_count", 0),
                total_task_count=emp.get("total_task_count", 0)
            )
            
            recommendations.append(rec)
        
        # Sort by similarity and return top_k
        recommendations.sort(key=lambda x: x.similarity_score, reverse=True)

        # If no one met the min_score threshold, still return a best-effort suggestion
        if not recommendations:
            fallback = self.get_fallback_assignment(team_lead_code=team_lead_code, task_description=task_description)
            return [fallback] if fallback else []

        return recommendations[:top_k]

    def _prelims_priority_recommendations(
        self,
        employees: List[Dict[str, Any]],
        top_k: int
    ) -> List[EmployeeRecommendation]:
        """For PRELIMS-style work, prioritize low experience (new joinees) and low workload."""

        if not employees:
            return []

        # Prefer lower experience, then lower active workload.
        employees_sorted = sorted(
            employees,
            key=lambda e: (
                e.get("experience_years", 0) or 0,
                e.get("active_task_count", 0),
            ),
        )

        recommendations: List[EmployeeRecommendation] = []
        for emp in employees_sorted[:top_k]:
            skills_match = self.extract_skills_match(emp)
            exp = emp.get("experience_years", 0) or 0
            active = emp.get("active_task_count", 0)
            reasoning = f"PRELIMS priority: lower experience ({exp}y) and low workload ({active} active tasks)"

            recommendations.append(
                EmployeeRecommendation(
                    employee_code=emp.get("employee_code"),
                    employee_name=emp.get("employee_name"),
                    similarity_score=0.35,
                    match_percentage=35,
                    current_role=emp.get("current_role", "Not specified"),
                    shift=emp.get("shift", "Day"),
                    experience_years=exp,
                    availability="ACTIVE" if emp.get("status_1") == "Permanent" else "INACTIVE",
                    reasoning=reasoning,
                    skills_match=skills_match,
                    task_relevance="Prelims task",
                    current_tasks=emp.get("current_tasks", []),
                    active_task_count=active,
                    total_task_count=emp.get("total_task_count", 0),
                )
            )

        return recommendations
    
    def get_fallback_assignment(
        self,
        team_lead_code: Optional[str] = None,
        task_description: Optional[str] = None,
        file_id: Optional[str] = None,
        current_file_stage: Optional[str] = None
    ) -> Optional[EmployeeRecommendation]:
        """
        Get fallback assignment for tasks with no skill mapping.
        Assigns to employee with least active tasks (or no tasks).
        """
        try:
            # Load all employees
            employees = self.load_employees(team_lead_code)
            
            if not employees:
                return None
            
            # Use enhanced stage detection with context
            detected_stage = StageAssignmentService.detect_stage_from_description_with_context(
                task_description or "", file_id, current_file_stage
            )

            # For PRELIMS-like work, prefer low experience (new joinees) first.
            if detected_stage == FileStage.PRELIMS:
                employees.sort(key=lambda x: (x.get("experience_years", 0) or 0, x.get("active_task_count", 0)))
            else:
                # Otherwise, least busy first.
                employees.sort(key=lambda x: (x.get("active_task_count", 0), x.get("experience_years", 0) or 0))
            
            # Get the least busy employee
            least_busy_emp = employees[0]
            
            # Create fallback recommendation
            rec = EmployeeRecommendation(
                employee_code=least_busy_emp.get("employee_code"),
                employee_name=least_busy_emp.get("employee_name"),
                similarity_score=0.1,  # Low score for fallback
                match_percentage=10,
                current_role=least_busy_emp.get("current_role", "Not specified"),
                shift=least_busy_emp.get("shift", "Day"),
                experience_years=least_busy_emp.get("experience_years", 0),
                availability="ACTIVE" if least_busy_emp.get("status_1") == "Permanent" else "INACTIVE",
                reasoning="Fallback assignment: No skill match found. Assigned to least busy employee.",
                skills_match={},
                task_relevance="General task assignment",
                current_tasks=least_busy_emp.get("current_tasks", []),
                active_task_count=least_busy_emp.get("active_task_count", 0),
                total_task_count=least_busy_emp.get("total_task_count", 0)
            )
            
            return rec
            
        except Exception as e:
            logger.error(f"Error in fallback assignment: {str(e)}")
            return None
    
    def build_reasoning(self, task: str, employee: dict, similarity: float) -> str:
        """Build explanation for recommendation"""
        
        reasons = []
        
        # Skills-based reasoning using normalized skills
        normalized_skills = self.skill_normalizer.normalize_employee_skills(employee)
        
        # Check for structural design skills
        if normalized_skills.get("structural_design"):
            has_structural = True
            structural_list = normalized_skills["structural_design"][:3]
            reasons.append(f"Strong in structural design ({', '.join(structural_list)})")
        
        # Check for electrical design skills
        if normalized_skills.get("electrical_design"):
            electrical_list = normalized_skills["electrical_design"][:3]
            reasons.append(f"Experienced in electrical design ({', '.join(electrical_list)})")
        
        # Check for coordination skills
        if normalized_skills.get("coordination"):
            reasons.append(f"Good coordination skills")
        
        # Experience-based reasoning
        exp = employee.get("experience_years", 0)
        if exp >= 5:
            reasons.append(f"Senior professional with {exp} years experience")
        elif exp >= 2:
            reasons.append(f"Experienced professional with {exp} years")
        
        # Task history reasoning
        task_history = employee.get("List of task assigned", "")
        if task_history and "design" in task_history.lower():
            reasons.append("Previous design experience")
        
        # Raw skills reasoning
        raw_skills = employee.get("raw_technical_skills", "")
        if raw_skills and "structural" in raw_skills.lower():
            reasons.append("Structural engineering background")
        if raw_skills and "design" in raw_skills.lower():
            reasons.append("Design experience")
        
        # If no specific reasons found, provide generic
        if not reasons:
            reasons.append("Qualified professional")
        
        return " | ".join(reasons)
    
    def extract_skills_match(self, employee: dict) -> Dict[str, List[str]]:
        """Extract skills in the expected format for frontend using skill normalizer"""
        
        # Use skill normalizer to properly extract and categorize skills
        normalized_skills = self.skill_normalizer.normalize_employee_skills(employee)
        
        skills_match = {}
        
        # Convert normalized skills to expected format
        for category, skills in normalized_skills.items():
            if skills:  # Only include categories that have skills
                skills_match[category] = skills
        
        # Fallback: Try old structure if no normalized skills found
        if not skills_match:
            old_skills = employee.get("skills", {})
            if old_skills and isinstance(old_skills, dict):
                for key, value in old_skills.items():
                    if isinstance(value, list):
                        skills_match[key] = value
                    else:
                        skills_match[key] = [str(value)]
        
        # Final fallback: Basic raw skills extraction
        if not skills_match:
            raw_skills = employee.get("raw_technical_skills", "")
            if raw_skills:
                raw_lower = raw_skills.lower()
                if "structural" in raw_lower:
                    skills_match["structural_design"] = ["Structural Engineering"]
                if "electrical" in raw_lower:
                    skills_match["electrical_design"] = ["Electrical Engineering"]
                if "coordination" in raw_lower:
                    skills_match["coordination"] = ["Coordination"]
        
        return skills_match
    
    def extract_task_relevance(self, employee: dict, task: str) -> str:
        """Extract relevant task experience from employee history"""
        
        task_lower = task.lower()
        task_history = employee.get("List of task assigned", "").lower()
        special_tasks = employee.get("Special Task", "").lower()
        
        relevant_tasks = []
        
        # Check for relevant keywords
        keywords = {
            "design": ["design", "designing", "designed"],
            "analysis": ["analysis", "analyzing", "analyzed"],
            "solar": ["solar", "pv", "photovoltaic"],
            "structural": ["structural", "structure"],
            "electrical": ["electrical", "electrics"],
            "autocad": ["autocad", "cad"],
            "preparation": ["preparation", "prepared"]
        }
        
        for key, variants in keywords.items():
            if any(v in task_lower for v in variants):
                if any(v in task_history for v in variants):
                    relevant_tasks.append(f"Previous {key} work")
                if any(v in special_tasks for v in variants):
                    relevant_tasks.append(f"Specialized in {key}")
        
        return " | ".join(relevant_tasks[:2]) if relevant_tasks else "New task type"
    
    def _extract_task_keywords(self, task_description: str) -> set:
        """Extract relevant keywords from task description"""
        task_lower = task_description.lower()
        
        keywords = set()
        
        # Structural design keywords
        structural_keywords = ["structural", "structure", "steel", "building", "rafter", 
                              "foundation", "column", "truss", "roof", "concrete", 
                              "beam", "load", "cad", "drawing"]
        
        # Electrical design keywords
        electrical_keywords = ["electrical", "pv", "solar", "photovoltaic", "inverter",
                              "string", "earthing", "cable", "switchgear", "panel"]
        
        # Coordination keywords
        coordination_keywords = ["coordination", "coordinate", "coordinating"]
        
        for kw in structural_keywords:
            if kw in task_lower:
                keywords.add("structural")
                keywords.add(kw)
        
        for kw in electrical_keywords:
            if kw in task_lower:
                keywords.add("electrical")
                keywords.add(kw)
        
        for kw in coordination_keywords:
            if kw in task_lower:
                keywords.add("coordination")
                keywords.add(kw)
        
        # Add generic design keyword
        if "design" in task_lower:
            keywords.add("design")
        
        return keywords
    
    def _calculate_keyword_score(self, employee: dict, task_keywords: set, task_description: str) -> float:
        """Calculate skill match score based on keyword matching"""
        
        if not task_keywords:
            return 0.0
        
        # Prefer normalized skills (from raw_technical_skills/raw_strength_expertise).
        skills = self.skill_normalizer.normalize_employee_skills(employee) or {}
        task_lower = task_description.lower()
        
        score = 0.0
        matches = 0
        
        # Check structural design skills
        if "structural" in task_keywords or "design" in task_keywords:
            structural_skills = skills.get("structural_design", [])
            if structural_skills:
                # Check for specific skill matches
                for skill in structural_skills:
                    skill_lower = skill.lower()
                    if any(kw in skill_lower for kw in task_keywords):
                        matches += 1
                        score += 0.15
                    elif "structural" in task_lower and "structural" in skill_lower:
                        matches += 1
                        score += 0.2
                    elif "design" in task_lower and "design" in skill_lower:
                        matches += 1
                        score += 0.1
        
        # Check electrical design skills
        if "electrical" in task_keywords or "solar" in task_keywords or "pv" in task_keywords:
            electrical_skills = skills.get("electrical_design", [])
            if electrical_skills:
                for skill in electrical_skills:
                    skill_lower = skill.lower()
                    if any(kw in skill_lower for kw in task_keywords):
                        matches += 1
                        score += 0.15
                    elif "electrical" in task_lower and "electrical" in skill_lower:
                        matches += 1
                        score += 0.2
        
        # Check coordination skills
        if "coordination" in task_keywords:
            coordination_skills = skills.get("coordination", [])
            if coordination_skills:
                for skill in coordination_skills:
                    skill_lower = skill.lower()
                    if "coordination" in skill_lower:
                        matches += 1
                        score += 0.15
        
        # Cap the score at 0.9 and ensure minimum if there are matches
        if matches > 0:
            score = min(score, 0.9)
            score = max(score, 0.35)  # Minimum score for any match
        
        return score

# Singleton instance
_engine_instance = None

def get_recommendation_engine() -> RecommendationEngine:
    """Get recommendation engine instance"""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = RecommendationEngine()
    return _engine_instance
