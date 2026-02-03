"""
File Deduplication Service
Ensures one physical file has only one file_id across the system
"""

import hashlib
import logging
from typing import Optional, Dict, List
from datetime import datetime

from app.db.mongodb import get_db
from app.models.stage_flow import FileStage

logger = logging.getLogger(__name__)

class FileDeduplicationService:
    """Service for managing file deduplication and consolidation"""
    
    @staticmethod
    def generate_content_hash(file_content: bytes) -> str:
        """Generate SHA-256 hash of file content"""
        return hashlib.sha256(file_content).hexdigest()
    
    @staticmethod
    def find_existing_file(file_hash: str, file_size: int, file_name: str) -> Optional[str]:
        """
        Find existing file by content hash, size, and name
        Returns the file_id if found, None otherwise
        """
        db = get_db()
        
        # First try to find by hash (most reliable)
        existing = db.permit_files.find_one({
            'file_hash': file_hash
        })
        if existing:
            logger.info(f"Found existing file by hash: {existing.get('file_id')}")
            return existing.get('file_id')
        
        # Fallback: try to find by size and name pattern
        existing = db.permit_files.find_one({
            'file_size': file_size,
            'file_name': file_name
        })
        if existing:
            logger.info(f"Found existing file by size/name: {existing.get('file_id')}")
            return existing.get('file_id')
        
        return None
    
    @staticmethod
    def consolidate_duplicate_files(target_file_id: str, duplicate_file_ids: List[str]) -> bool:
        """
        Consolidate duplicate files into a single file_id
        Moves all stage history and tasks to the target file_id
        """
        db = get_db()
        
        try:
            logger.info(f"Consolidating {len(duplicate_file_ids)} duplicates into {target_file_id}")
            
            # Consolidate file_tracking entries
            target_tracking = db.file_tracking.find_one({'file_id': target_file_id})
            
            for dup_id in duplicate_file_ids:
                # Move stage history from duplicate to target
                dup_tracking = db.file_tracking.find_one({'file_id': dup_id})
                if dup_tracking:
                    # Merge stage history
                    dup_history = dup_tracking.get('stage_history', [])
                    if dup_history and target_tracking:
                        existing_history = target_tracking.get('stage_history', [])
                        # Combine and deduplicate
                        combined_history = existing_history + dup_history
                        # Sort by timestamp if available
                        combined_history.sort(key=lambda x: x.get('started_at', datetime.min))
                        
                        db.file_tracking.update_one(
                            {'file_id': target_file_id},
                            {'$set': {'stage_history': combined_history}}
                        )
                
                # Move tasks to target file
                db.tasks.update_many(
                    {'source.permit_file_id': dup_id},
                    {'$set': {'source.permit_file_id': target_file_id}}
                )
                
                # Move profile_building entries
                db.profile_building.update_many(
                    {'permit_file_id': dup_id},
                    {'$set': {'permit_file_id': target_file_id}}
                )
                
                # Delete duplicate file_tracking
                db.file_tracking.delete_one({'file_id': dup_id})
                
                # Delete duplicate permit_files entry
                db.permit_files.delete_one({'file_id': dup_id})
                
                logger.info(f"Consolidated duplicate: {dup_id} -> {target_file_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error consolidating files: {e}")
            return False
    
    @staticmethod
    def detect_and_consolidate_duplicates() -> Dict[str, List[str]]:
        """
        Detect duplicate files and return groups of duplicates
        Returns dictionary with target_file_id as key and list of duplicates as value
        """
        db = get_db()
        
        # Group files by hash
        hash_groups = {}
        all_files = list(db.permit_files.find({
            'file_hash': {'$exists': True, '$ne': None}
        }))
        
        for file_doc in all_files:
            file_hash = file_doc.get('file_hash')
            file_id = file_doc.get('file_id')
            created_at = file_doc.get('uploaded_at', datetime.min)
            
            if file_hash not in hash_groups:
                hash_groups[file_hash] = []
            hash_groups[file_hash].append({
                'file_id': file_id,
                'created_at': created_at,
                'file_doc': file_doc
            })
        
        # Find duplicates and determine target (oldest)
        duplicate_groups = {}
        for file_hash, files in hash_groups.items():
            if len(files) > 1:
                # Sort by creation date, oldest first
                files.sort(key=lambda x: x['created_at'])
                target_file_id = files[0]['file_id']
                duplicate_ids = [f['file_id'] for f in files[1:]]
                
                duplicate_groups[target_file_id] = duplicate_ids
                logger.info(f"Found duplicates for hash {file_hash[:16]}...: target={target_file_id}, duplicates={duplicate_ids}")
        
        return duplicate_groups
    
    @staticmethod
    def cleanup_all_duplicates() -> int:
        """
        Find and consolidate all duplicate files
        Returns number of duplicate groups cleaned up
        """
        logger.info("Starting duplicate file cleanup...")
        
        duplicate_groups = FileDeduplicationService.detect_and_consolidate_duplicates()
        
        cleaned_count = 0
        for target_file_id, duplicate_ids in duplicate_groups.items():
            if FileDeduplicationService.consolidate_duplicate_files(target_file_id, duplicate_ids):
                cleaned_count += 1
        
        logger.info(f"Cleanup completed. Consolidated {cleaned_count} duplicate groups.")
        return cleaned_count
    
    @staticmethod
    def get_file_statistics() -> Dict:
        """Get statistics about file deduplication"""
        db = get_db()
        
        stats = {
            'permit_files_count': db.permit_files.count_documents({}),
            'file_tracking_count': db.file_tracking.count_documents({}),
            'tasks_count': db.tasks.count_documents({}),
            'profile_building_count': db.profile_building.count_documents({}),
            'files_with_hash': db.permit_files.count_documents({'file_hash': {'$exists': True}}),
            'duplicate_groups': 0,
            'total_duplicates': 0
        }
        
        # Count duplicates
        hash_groups = {}
        files_with_hash = list(db.permit_files.find({'file_hash': {'$exists': True}}))
        
        for file_doc in files_with_hash:
            file_hash = file_doc.get('file_hash')
            if file_hash not in hash_groups:
                hash_groups[file_hash] = []
            hash_groups[file_hash].append(file_doc)
        
        for file_hash, files in hash_groups.items():
            if len(files) > 1:
                stats['duplicate_groups'] += 1
                stats['total_duplicates'] += len(files) - 1
        
        return stats


def get_file_deduplication_service() -> FileDeduplicationService:
    """Factory function to get FileDeduplicationService instance"""
    return FileDeduplicationService()
