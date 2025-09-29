"""
Pydantic schemas package.
"""
from .user import (
    UtilisateurBase,
    UtilisateurCreate,
    UtilisateurRead,
    UserProfileUpdate,
    UserStatusUpdate,
    UserAdminUpdate,
    PasswordChangeRequest
)
from .auth import (
    Token,
    TokenData,
    LoginRequest,
    MessageResponse
)
from .researcher import (
    ChercheurBase,
    ChercheurCreate,
    ChercheurRead
)
from .api_key import (
    CleApiBase,
    CleApiCreate,
    CleApiUpdate,
    CleApiRead
)
from .similarity import (
    ProjectQuery,
    ResearcherMatch,
    DetailedResearcherMatch,
    HealthStatus,
    SystemStats,
    RefreshResponse
)

__all__ = [
    # User schemas
    "UtilisateurBase",
    "UtilisateurCreate", 
    "UtilisateurRead",
    "UserProfileUpdate",
    "UserStatusUpdate",
    "UserAdminUpdate",
    "PasswordChangeRequest",
    # Auth schemas
    "Token",
    "TokenData",
    "LoginRequest",
    "MessageResponse",
    # Researcher schemas
    "ChercheurBase",
    "ChercheurCreate",
    "ChercheurRead",
    # API Key schemas
    "CleApiBase",
    "CleApiCreate",
    "CleApiUpdate",
    "CleApiRead",
    # Similarity schemas
    "ProjectQuery",
    "ResearcherMatch",
    "DetailedResearcherMatch",
    "HealthStatus",
    "SystemStats",
    "RefreshResponse"
]