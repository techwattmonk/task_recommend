"""
MongoDB Connection Pool Manager
Provides singleton connection pool for better performance
"""
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from app.core.settings import settings
import logging

logger = logging.getLogger(__name__)

class MongoDBConnection:
    """Singleton MongoDB connection pool"""
    _instance = None
    _client = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MongoDBConnection, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._connect()
    
    def _connect(self):
        """Initialize MongoDB connection with pooling"""
        try:
            self._client = MongoClient(
                settings.mongodb_uri,
                maxPoolSize=15,
                minPoolSize=3,
                maxIdleTimeMS=60000,
                serverSelectionTimeoutMS=7000,
                connectTimeoutMS=15000,
                socketTimeoutMS=30000,
                retryWrites=True,
                retryReads=True,
                w="majority",
                readPreference="secondaryPreferred"
            )
            self._db = self._client[settings.mongodb_db]
            logger.info(f"Connected to MongoDB: {settings.mongodb_db}")
        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error connecting to MongoDB: {e}")
            raise
    
    def get_database(self):
        """Get database instance"""
        if self._client is None:
            self._connect()
        return self._db
        return self._client[settings.mongodb_db]
    
    def close(self):
        """Close MongoDB connection"""
        if self._client:
            self._client.close()
            self._client = None
            logger.info("MongoDB connection closed")

# Singleton instance
_mongo_connection = MongoDBConnection()

def get_db():
    """Get MongoDB database instance with connection pooling and health check"""
    try:
        db = _mongo_connection.get_database()
        # Health check - ping the database
        db.command('ping')
        return db
    except Exception as e:
        logger.warning(f"MongoDB health check failed, attempting reconnect: {str(e)}")
        # Force reconnection
        _mongo_connection._client = None
        _mongo_connection._connect()
        return _mongo_connection.get_database()
