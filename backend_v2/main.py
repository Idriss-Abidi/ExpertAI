from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, mapped_column, Mapped
from sqlalchemy import String, Text, Boolean, Integer, BigInteger, ForeignKey, DateTime
import sqlalchemy as sa
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer()

DATABASE_URL = "postgresql+asyncpg://postgres:a@localhost:5432/results"

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()

# Gestionnaire de cycle de vie
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        # Cette méthode ne crée que les tables qui n'existent pas déjà
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Database connection established and tables verified!")
    yield
    # Shutdown
    await engine.dispose()

app = FastAPI(
    title="Research Database API",
    description="API moderne pour la gestion de la base de données de recherche",
    version="2.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

# -----------------------------
# MODELS
# -----------------------------

class Utilisateur(Base):
    __tablename__ = "utilisateurs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255))
    prenom: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column("email", String(255), unique=True)
    mot_de_passe_hash: Mapped[str] = mapped_column("mot_de_passe_hash", Text)
    date_creation: Mapped[datetime] = mapped_column("date_creation", DateTime, server_default=sa.func.now())
    date_modification: Mapped[datetime] = mapped_column("date_modification", DateTime, server_default=sa.func.now())
    est_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    telephone: Mapped[Optional[str]] = mapped_column(String(20))
    est_actif: Mapped[bool] = mapped_column("est_actif", Boolean, default=True)

class Chercheur(Base):
    __tablename__ = "chercheurs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255))
    prenom: Mapped[str] = mapped_column(String(255))
    affiliation: Mapped[Optional[str]] = mapped_column(String(255))
    orcid_id: Mapped[Optional[str]] = mapped_column(String(19), unique=True)
    domaines_recherche: Mapped[Optional[str]] = mapped_column(Text)
    mots_cles_specifiques: Mapped[Optional[str]] = mapped_column(Text)

class CleApi(Base):
    __tablename__ = "cles_api"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateurs.id", ondelete="CASCADE"))
    cle_openai: Mapped[Optional[str]] = mapped_column(Text)
    cle_gemini: Mapped[Optional[str]] = mapped_column(Text)
    cle_claude: Mapped[Optional[str]] = mapped_column(Text)
    cle_deepseek: Mapped[Optional[str]] = mapped_column(Text)
    cle_scopus: Mapped[Optional[str]] = mapped_column(Text)

class ConfigurationBase(Base):
    __tablename__ = "configurations_bases"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom_base: Mapped[str] = mapped_column(String(100), unique=True)
    type_base: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text)
    parametres_connexion: Mapped[Optional[str]] = mapped_column(Text)
    est_active: Mapped[bool] = mapped_column(Boolean, default=True)
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=sa.func.now())

class AccesBase(Base):
    __tablename__ = "acces_bases"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateurs.id"))
    configuration_base_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("configurations_bases.id"))
    niveau_acces: Mapped[str] = mapped_column(String(20))
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=sa.func.now())

# -----------------------------
# Pydantic Schemas
# -----------------------------

class UtilisateurBase(BaseModel):
    nom: str
    prenom: str
    email: str
    telephone: Optional[str] = None
    est_admin: bool = False
    est_actif: bool = True

class UtilisateurCreate(UtilisateurBase):
    mot_de_passe: str

class UtilisateurRead(UtilisateurBase):
    id: int
    date_creation: datetime

    class Config:
        from_attributes = True

# Authentication Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UtilisateurRead

class TokenData(BaseModel):
    email: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    mot_de_passe: str

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

class UserStatusUpdate(BaseModel):
    est_actif: bool

class UserAdminUpdate(BaseModel):
    est_admin: bool

class UserProfileUpdate(BaseModel):
    nom: str
    prenom: str
    email: str
    telephone: Optional[str] = None

class ChercheurBase(BaseModel):
    nom: str
    prenom: str
    affiliation: Optional[str] = None
    orcid_id: Optional[str] = None
    domaines_recherche: Optional[str] = None
    mots_cles_specifiques: Optional[str] = None

class ChercheurCreate(ChercheurBase):
    pass

class ChercheurRead(ChercheurBase):
    id: int

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    message: str

# API Key Schemas
class CleApiBase(BaseModel):
    cle_openai: Optional[str] = None
    cle_gemini: Optional[str] = None
    cle_claude: Optional[str] = None
    cle_deepseek: Optional[str] = None
    cle_scopus: Optional[str] = None

class CleApiCreate(CleApiBase):
    utilisateur_id: int = 1  # Default to user 1

class CleApiUpdate(CleApiBase):
    pass

class CleApiRead(CleApiBase):
    id: int
    utilisateur_id: int

    class Config:
        from_attributes = True

# -----------------------------
# Dependency
# -----------------------------

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

# -----------------------------
# HELPER FUNCTIONS
# -----------------------------

def hash_password(password: str) -> str:
    """Simple hash function - in production use bcrypt"""
    import hashlib
    return hashlib.sha256(password.encode()).hexdigest()

# Authentication Helper Functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session)
) -> Utilisateur:
    """Get the current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    # Get user from database
    result = await session.execute(
        sa.select(Utilisateur).where(Utilisateur.email == token_data.email)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return user

async def get_current_active_user(
    current_user: Utilisateur = Depends(get_current_user)
) -> Utilisateur:
    """Get the current active user"""
    if not current_user.est_actif:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# -----------------------------
# AUTHENTICATION ROUTES
# -----------------------------

@app.post("/api/auth/login", response_model=Token)
async def login(login_data: LoginRequest, session: AsyncSession = Depends(get_session)):
    """Login endpoint that returns JWT token"""
    # Find user by email
    result = await session.execute(
        sa.select(Utilisateur).where(Utilisateur.email == login_data.email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(login_data.mot_de_passe, user.mot_de_passe_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create access token with user ID and admin status
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "is_admin": user.est_admin,
            "is_active": user.est_actif
        }, 
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user
    )

@app.post("/api/auth/register", response_model=UtilisateurRead)
async def register(utilisateur: UtilisateurCreate, session: AsyncSession = Depends(get_session)):
    """Register a new user"""
    # Check if email exists
    result = await session.execute(sa.select(Utilisateur).where(Utilisateur.email == utilisateur.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user with bcrypt hash
    hashed_password = get_password_hash(utilisateur.mot_de_passe)
    db_utilisateur = Utilisateur(
        nom=utilisateur.nom,
        prenom=utilisateur.prenom,
        email=utilisateur.email,
        mot_de_passe_hash=hashed_password,
        telephone=utilisateur.telephone,
        est_admin=utilisateur.est_admin,
        est_actif=utilisateur.est_actif
    )
    session.add(db_utilisateur)
    await session.commit()
    await session.refresh(db_utilisateur)
    return db_utilisateur

@app.get("/api/auth/me", response_model=UtilisateurRead)
async def get_current_user_info(current_user: Utilisateur = Depends(get_current_active_user)):
    """Get current user information"""
    return current_user

@app.post("/api/auth/change-password", response_model=MessageResponse)
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: Utilisateur = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    """Change user password"""
    # Verify old password
    if not verify_password(password_data.old_password, current_user.mot_de_passe_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Hash new password
    new_password_hash = get_password_hash(password_data.new_password)
    
    # Update password in database
    current_user.mot_de_passe_hash = new_password_hash
    current_user.date_modification = datetime.utcnow()
    
    await session.commit()
    
    return MessageResponse(message="Password changed successfully")

# -----------------------------
# ROUTES - UTILISATEURS
# -----------------------------

@app.post("/api/utilisateurs/", response_model=UtilisateurRead)
async def create_utilisateur(
    utilisateur: UtilisateurCreate, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Create a new user (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    # Check if email exists
    result = await session.execute(sa.select(Utilisateur).where(Utilisateur.email == utilisateur.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user with bcrypt hash
    hashed_password = get_password_hash(utilisateur.mot_de_passe)
    db_utilisateur = Utilisateur(
        nom=utilisateur.nom,
        prenom=utilisateur.prenom,
        email=utilisateur.email,
        mot_de_passe_hash=hashed_password,
        telephone=utilisateur.telephone,
        est_admin=utilisateur.est_admin,
        est_actif=utilisateur.est_actif
    )
    session.add(db_utilisateur)
    await session.commit()
    await session.refresh(db_utilisateur)
    return db_utilisateur

@app.get("/api/utilisateurs/", response_model=List[UtilisateurRead])
async def list_utilisateurs(
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """List all users (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    result = await session.execute(sa.select(Utilisateur))
    return result.scalars().all()

@app.get("/api/utilisateurs/{utilisateur_id}", response_model=UtilisateurRead)
async def get_utilisateur(
    utilisateur_id: int, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Get a specific user (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    result = await session.get(Utilisateur, utilisateur_id)
    if not result:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return result

@app.delete("/api/utilisateurs/{utilisateur_id}", response_model=MessageResponse)
async def delete_utilisateur(
    utilisateur_id: int, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Delete a user (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    db_utilisateur = await session.get(Utilisateur, utilisateur_id)
    if not db_utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    await session.delete(db_utilisateur)
    await session.commit()
    return MessageResponse(message=f"Utilisateur {db_utilisateur.nom} {db_utilisateur.prenom} supprimé")

@app.patch("/api/utilisateurs/{utilisateur_id}/toggle-status", response_model=MessageResponse)
async def toggle_user_status(
    utilisateur_id: int, 
    status_update: UserStatusUpdate,
    current_user: Utilisateur = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    """Toggle user active status (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    db_utilisateur = await session.get(Utilisateur, utilisateur_id)
    if not db_utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Prevent admin from deactivating themselves
    if db_utilisateur.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own status")
    
    db_utilisateur.est_actif = status_update.est_actif
    db_utilisateur.date_modification = datetime.utcnow()
    
    await session.commit()
    
    status_text = "activé" if status_update.est_actif else "désactivé"
    return MessageResponse(message=f"Utilisateur {db_utilisateur.prenom} {db_utilisateur.nom} {status_text}")

@app.patch("/api/utilisateurs/{utilisateur_id}/toggle-admin", response_model=MessageResponse)
async def toggle_user_admin(
    utilisateur_id: int, 
    admin_update: UserAdminUpdate,
    current_user: Utilisateur = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    """Toggle user admin privileges (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    db_utilisateur = await session.get(Utilisateur, utilisateur_id)
    if not db_utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Prevent admin from removing admin from themselves
    if db_utilisateur.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own admin status")
    
    db_utilisateur.est_admin = admin_update.est_admin
    db_utilisateur.date_modification = datetime.utcnow()
    
    await session.commit()
    
    admin_text = "promu administrateur" if admin_update.est_admin else "retiré des administrateurs"
    return MessageResponse(message=f"Utilisateur {db_utilisateur.prenom} {db_utilisateur.nom} {admin_text}")

@app.patch("/api/utilisateurs/profile", response_model=UtilisateurRead)
async def update_user_profile(
    profile_update: UserProfileUpdate,
    current_user: Utilisateur = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    """Update current user's profile information"""
    # Check if email is being changed and if it already exists
    if profile_update.email != current_user.email:
        result = await session.execute(sa.select(Utilisateur).where(Utilisateur.email == profile_update.email))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered")
    
    # Update user profile
    current_user.nom = profile_update.nom
    current_user.prenom = profile_update.prenom
    current_user.email = profile_update.email
    current_user.telephone = profile_update.telephone
    current_user.date_modification = datetime.utcnow()
    
    await session.commit()
    await session.refresh(current_user)
    
    return current_user

# -----------------------------
# ROUTES - CHERCHEURS
# -----------------------------

@app.post("/api/chercheurs/", response_model=ChercheurRead)
async def create_chercheur(chercheur: ChercheurCreate, session: AsyncSession = Depends(get_session)):
    # Check if utilisateur exists if provided
    if chercheur.utilisateur_id:
        result = await session.get(Utilisateur, chercheur.utilisateur_id)
        if not result:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Check if ORCID already exists if provided
    if chercheur.orcid_id:
        result = await session.execute(sa.select(Chercheur).where(Chercheur.orcid_id == chercheur.orcid_id))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="ORCID ID already exists")
    
    # Create chercheur
    db_chercheur = Chercheur(**chercheur.dict())
    session.add(db_chercheur)
    await session.commit()
    await session.refresh(db_chercheur)
    return db_chercheur

# Bulk save endpoint for ORCID search results
@app.post("/api/chercheurs/save")
async def save_chercheurs_bulk(
    request: dict,
    session: AsyncSession = Depends(get_session)
):
    """Save multiple researchers from ORCID search results"""
    try:
        chercheurs_data = request.get("chercheurs", [])
        if not chercheurs_data:
            raise HTTPException(status_code=400, detail="No chercheurs data provided")
        
        saved_chercheurs = []
        duplicate_chercheurs = []
        failed_chercheurs = []
        
        for chercheur_data in chercheurs_data:
            try:
                # Check if researcher with this ORCID already exists
                orcid_id = chercheur_data.get("orcid_id")
                if orcid_id:
                    existing_query = sa.select(Chercheur).where(Chercheur.orcid_id == orcid_id)
                    existing_result = await session.execute(existing_query)
                    existing_chercheur = existing_result.scalar_one_or_none()
                    
                    if existing_chercheur:
                        duplicate_chercheurs.append({
                            "orcid_id": orcid_id,
                            "nom": chercheur_data.get("nom", ""),
                            "prenom": chercheur_data.get("prenom", ""),
                            "existing_id": existing_chercheur.id
                        })
                        continue
                
                # Create chercheur instance - map frontend fields to database schema
                # Truncate affiliation to 255 characters if it's too long
                affiliation = chercheur_data.get("affiliation", "")
                if affiliation and len(affiliation) > 255:
                    affiliation = affiliation[:255]
                
                db_chercheur = Chercheur(
                    nom=chercheur_data.get("nom", ""),
                    prenom=chercheur_data.get("prenom", ""),
                    affiliation=affiliation,
                    orcid_id=orcid_id,
                    # Map frontend field names to database field names
                    domaines_recherche=chercheur_data.get("domaine_recherche"),  # frontend sends singular, DB expects plural
                    mots_cles_specifiques=chercheur_data.get("mots_cles_specifiques")
                )
                
                session.add(db_chercheur)
                await session.flush()  # Flush to get the ID
                await session.refresh(db_chercheur)
                saved_chercheurs.append(db_chercheur)
                
            except Exception as e:
                failed_chercheurs.append({
                    "orcid_id": chercheur_data.get("orcid_id"),
                    "nom": chercheur_data.get("nom", ""),
                    "prenom": chercheur_data.get("prenom", ""),
                    "error": str(e)
                })
                continue
        
        await session.commit()
        
        return {
            "message": f"Successfully saved {len(saved_chercheurs)} chercheurs",
            "saved_count": len(saved_chercheurs),
            "duplicate_count": len(duplicate_chercheurs),
            "failed_count": len(failed_chercheurs),
            "chercheurs": [
                {
                    "id": c.id,
                    "nom": c.nom,
                    "prenom": c.prenom,
                    "orcid_id": c.orcid_id,
                    "affiliation": c.affiliation
                } for c in saved_chercheurs
            ],
            "duplicates": duplicate_chercheurs,
            "failed": failed_chercheurs
        }
        
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save chercheurs: {str(e)}")

# Check if researcher exists by ORCID
@app.post("/api/chercheurs/check-orcid")
async def check_chercheur_by_orcid(
    request: dict,
    session: AsyncSession = Depends(get_session)
):
    """Check if a researcher with the given ORCID ID already exists"""
    try:
        orcid_id = request.get("orcid_id")
        if not orcid_id:
            raise HTTPException(status_code=400, detail="ORCID ID is required")
        
        # Query for existing researcher with this ORCID
        query = sa.select(Chercheur).where(Chercheur.orcid_id == orcid_id)
        result = await session.execute(query)
        existing_chercheur = result.scalar_one_or_none()
        
        if existing_chercheur:
            return {
                "exists": True,
                "researcher": {
                    "id": existing_chercheur.id,
                    "nom": existing_chercheur.nom,
                    "prenom": existing_chercheur.prenom,
                    "affiliation": existing_chercheur.affiliation,
                    "orcid_id": existing_chercheur.orcid_id,
                    "domaines_recherche": existing_chercheur.domaines_recherche,
                    "mots_cles_specifiques": existing_chercheur.mots_cles_specifiques
                }
            }
        else:
            return {
                "exists": False,
                "researcher": None
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check ORCID: {str(e)}")

@app.get("/api/chercheurs/", response_model=List[ChercheurRead])
async def list_chercheurs(
    skip: int = 0, 
    limit: int = 100,
    search: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    """Get all researchers with optional search"""
    query = sa.select(Chercheur)
    
    # Add search functionality across all fields
    if search:
        search_term = f"%{search}%"
        query = query.where(
            sa.or_(
                Chercheur.nom.ilike(search_term),
                Chercheur.prenom.ilike(search_term),
                Chercheur.affiliation.ilike(search_term),
                Chercheur.orcid_id.ilike(search_term),
                Chercheur.domaines_recherche.ilike(search_term),
                Chercheur.mots_cles_specifiques.ilike(search_term)
            )
        )
    
    query = query.offset(skip).limit(limit)
    result = await session.execute(query)
    chercheurs = result.scalars().all()
    
    return chercheurs

@app.get("/api/chercheurs/{chercheur_id}", response_model=ChercheurRead)
async def get_chercheur(chercheur_id: int, session: AsyncSession = Depends(get_session)):
    """Get a specific researcher by ID"""
    result = await session.get(Chercheur, chercheur_id)
    if not result:
        raise HTTPException(status_code=404, detail="Chercheur non trouvé")
    return result

@app.post("/api/chercheurs/", response_model=ChercheurRead)
async def create_chercheur(chercheur: ChercheurCreate, session: AsyncSession = Depends(get_session)):
    """Create a new researcher"""
    try:
        # Check if researcher with this ORCID already exists
        if chercheur.orcid_id:
            existing_query = sa.select(Chercheur).where(Chercheur.orcid_id == chercheur.orcid_id)
            existing_result = await session.execute(existing_query)
            existing_chercheur = existing_result.scalar_one_or_none()
            
            if existing_chercheur:
                raise HTTPException(
                    status_code=409, 
                    detail=f"Researcher with ORCID ID {chercheur.orcid_id} already exists (ID: {existing_chercheur.id})"
                )
        
        # Truncate affiliation to 255 characters if it's too long
        chercheur_dict = chercheur.dict()
        if chercheur_dict.get("affiliation") and len(chercheur_dict["affiliation"]) > 255:
            chercheur_dict["affiliation"] = chercheur_dict["affiliation"][:255]
        
        db_chercheur = Chercheur(**chercheur_dict)
        session.add(db_chercheur)
        await session.commit()
        await session.refresh(db_chercheur)
        return db_chercheur
    except HTTPException:
        # Re-raise HTTP exceptions (like 409 for duplicates)
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create chercheur: {str(e)}")

@app.post("/api/chercheurs/overwrite")
async def overwrite_chercheurs(
    request: dict,
    session: AsyncSession = Depends(get_session)
):
    """Overwrite existing researchers with new data"""
    try:
        chercheurs_data = request.get("chercheurs", [])
        if not chercheurs_data:
            raise HTTPException(status_code=400, detail="No chercheurs data provided")
        
        overwritten_chercheurs = []
        
        for chercheur_data in chercheurs_data:
            orcid_id = chercheur_data.get("orcid_id")
            if not orcid_id:
                continue
                
            # Find existing researcher
            existing_query = sa.select(Chercheur).where(Chercheur.orcid_id == orcid_id)
            existing_result = await session.execute(existing_query)
            existing_chercheur = existing_result.scalar_one_or_none()
            
            if existing_chercheur:
                # Update existing researcher
                existing_chercheur.nom = chercheur_data.get("nom", existing_chercheur.nom)
                existing_chercheur.prenom = chercheur_data.get("prenom", existing_chercheur.prenom)
                
                # Truncate affiliation to 255 characters if it's too long
                affiliation = chercheur_data.get("affiliation", existing_chercheur.affiliation)
                if affiliation and len(affiliation) > 255:
                    affiliation = affiliation[:255]
                existing_chercheur.affiliation = affiliation
                
                existing_chercheur.domaines_recherche = chercheur_data.get("domaine_recherche", existing_chercheur.domaines_recherche)
                existing_chercheur.mots_cles_specifiques = chercheur_data.get("mots_cles_specifiques", existing_chercheur.mots_cles_specifiques)
                
                overwritten_chercheurs.append(existing_chercheur)
            else:
                # Create new researcher if not found
                # Truncate affiliation to 255 characters if it's too long
                affiliation = chercheur_data.get("affiliation", "")
                if affiliation and len(affiliation) > 255:
                    affiliation = affiliation[:255]
                
                db_chercheur = Chercheur(
                    nom=chercheur_data.get("nom", ""),
                    prenom=chercheur_data.get("prenom", ""),
                    affiliation=affiliation,
                    orcid_id=orcid_id,
                    domaines_recherche=chercheur_data.get("domaine_recherche"),
                    mots_cles_specifiques=chercheur_data.get("mots_cles_specifiques")
                )
                session.add(db_chercheur)
                overwritten_chercheurs.append(db_chercheur)
        
        await session.commit()
        
        # Refresh all researchers to get their IDs
        for chercheur in overwritten_chercheurs:
            await session.refresh(chercheur)
        
        return {
            "message": f"Successfully overwrote {len(overwritten_chercheurs)} chercheurs",
            "overwritten_count": len(overwritten_chercheurs),
            "chercheurs": [
                {
                    "id": c.id,
                    "nom": c.nom,
                    "prenom": c.prenom,
                    "orcid_id": c.orcid_id,
                    "affiliation": c.affiliation
                } for c in overwritten_chercheurs
            ]
        }
        
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to overwrite chercheurs: {str(e)}")

@app.put("/api/chercheurs/{chercheur_id}", response_model=ChercheurRead)
async def update_chercheur(
    chercheur_id: int, 
    chercheur: ChercheurCreate, 
    session: AsyncSession = Depends(get_session)
):
    """Update an existing researcher"""
    db_chercheur = await session.get(Chercheur, chercheur_id)
    if not db_chercheur:
        raise HTTPException(status_code=404, detail="Chercheur non trouvé")
    
    try:
        chercheur_dict = chercheur.dict()
        
        # Truncate affiliation to 255 characters if it's too long
        if chercheur_dict.get("affiliation") and len(chercheur_dict["affiliation"]) > 255:
            chercheur_dict["affiliation"] = chercheur_dict["affiliation"][:255]
        
        for key, value in chercheur_dict.items():
            setattr(db_chercheur, key, value)
        
        await session.commit()
        await session.refresh(db_chercheur)
        return db_chercheur
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update chercheur: {str(e)}")

@app.delete("/api/chercheurs/{chercheur_id}", response_model=MessageResponse)
async def delete_chercheur(chercheur_id: int, session: AsyncSession = Depends(get_session)):
    """Delete a researcher"""
    db_chercheur = await session.get(Chercheur, chercheur_id)
    if not db_chercheur:
        raise HTTPException(status_code=404, detail="Chercheur non trouvé")

    try:
        await session.delete(db_chercheur)
        await session.commit()
        return MessageResponse(message=f"Chercheur {db_chercheur.prenom} {db_chercheur.nom} supprimé")
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to delete chercheur: {str(e)}")

# -----------------------------
# ROUTES - API KEYS
# -----------------------------

@app.get("/api/cles-api/{utilisateur_id}", response_model=CleApiRead)
async def get_api_keys(
    utilisateur_id: int, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Get API keys for a specific user (admin only)"""
    # if not current_user.est_admin:
    #     raise HTTPException(status_code=403, detail="Admin privileges required")
    result = await session.execute(
        sa.select(CleApi).where(CleApi.utilisateur_id == utilisateur_id)
    )
    db_cles = result.scalar_one_or_none()
    
    if not db_cles:
        # Return empty API keys if none exist
        return CleApiRead(
            id=0,
            utilisateur_id=utilisateur_id,
            cle_openai=None,
            cle_gemini=None,
            cle_claude=None,
            cle_deepseek=None,
            cle_scopus=None
        )
    
    return db_cles

@app.post("/api/cles-api/", response_model=CleApiRead)
async def create_api_keys(
    cles: CleApiCreate, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Create new API keys for a user (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    # Check if API keys already exist for this user
    existing_result = await session.execute(
        sa.select(CleApi).where(CleApi.utilisateur_id == cles.utilisateur_id)
    )
    existing_cles = existing_result.scalar_one_or_none()
    
    if existing_cles:
        raise HTTPException(
            status_code=400, 
            detail="API keys already exist for this user. Use PUT to update them."
        )
    
    # Create new API keys
    db_cles = CleApi(
        utilisateur_id=cles.utilisateur_id,
        cle_openai=cles.cle_openai,
        cle_gemini=cles.cle_gemini,
        cle_claude=cles.cle_claude,
        cle_deepseek=cles.cle_deepseek,
        cle_scopus=cles.cle_scopus
    )
    
    session.add(db_cles)
    await session.commit()
    await session.refresh(db_cles)
    return db_cles

@app.put("/api/cles-api/{utilisateur_id}", response_model=CleApiRead)
async def update_api_keys(
    utilisateur_id: int, 
    cles: CleApiUpdate, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Update API keys for a user (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    # Check if API keys exist for this user
    result = await session.execute(
        sa.select(CleApi).where(CleApi.utilisateur_id == utilisateur_id)
    )
    db_cles = result.scalar_one_or_none()
    
    if not db_cles:
        # Create new API keys if they don't exist
        db_cles = CleApi(utilisateur_id=utilisateur_id)
        session.add(db_cles)
    
    # Update only the provided fields
    if cles.cle_openai is not None:
        db_cles.cle_openai = cles.cle_openai
    if cles.cle_gemini is not None:
        db_cles.cle_gemini = cles.cle_gemini
    if cles.cle_claude is not None:
        db_cles.cle_claude = cles.cle_claude
    if cles.cle_deepseek is not None:
        db_cles.cle_deepseek = cles.cle_deepseek
    if cles.cle_scopus is not None:
        db_cles.cle_scopus = cles.cle_scopus
    
    await session.commit()
    await session.refresh(db_cles)
    return db_cles

@app.delete("/api/cles-api/{utilisateur_id}", response_model=MessageResponse)
async def delete_api_keys(
    utilisateur_id: int, 
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Delete API keys for a user (admin only)"""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    result = await session.execute(
        sa.select(CleApi).where(CleApi.utilisateur_id == utilisateur_id)
    )
    db_cles = result.scalar_one_or_none()
    
    if not db_cles:
        raise HTTPException(status_code=404, detail="API keys not found for this user")
    
    await session.delete(db_cles)
    await session.commit()
    return MessageResponse(message="API keys deleted successfully")

@app.get("/api/cles-api/model/{model_name}")
async def get_api_key_for_model(
    model_name: str,
    session: AsyncSession = Depends(get_session)
):
    """Get API key for a specific model from the database"""
    try:
        # Get the first API key record (assuming global API keys)
        result = await session.execute(sa.select(CleApi))
        api_keys = result.scalar_one_or_none()
        
        if not api_keys:
            raise HTTPException(status_code=404, detail="No API keys found in database")
        
        # Determine which API key to return based on model name
        print(f"[DEBUG] Model name: {model_name}")
        print(f"[DEBUG] Available keys - OpenAI: {bool(api_keys.cle_openai)}, Gemini: {bool(api_keys.cle_gemini)}, DeepSeek: {bool(api_keys.cle_deepseek)}")
        
        if model_name.startswith("o4-") or model_name.startswith("gpt-"):
            api_key = api_keys.cle_openai
            provider = "openai"
            print(f"[DEBUG] Using OpenAI key for {model_name}")
        elif model_name.startswith("gemini") or "gemini" in model_name:
            if api_keys.cle_gemini:
                api_key = api_keys.cle_gemini
                provider = "gemini"
                print(f"[DEBUG] Using Gemini key for {model_name}")
            else:
                # Fallback to OpenAI key for Gemini models if Gemini key not available
                api_key = api_keys.cle_openai
                provider = "openai"
                print(f"[DEBUG] Gemini key not available, using OpenAI key for {model_name}")
        elif model_name.startswith("deepseek") or "deepseek" in model_name:
            api_key = api_keys.cle_deepseek
            provider = "deepseek"
            print(f"[DEBUG] Using DeepSeek key for {model_name}")
        else:
            # Default to OpenAI
            api_key = api_keys.cle_openai
            provider = "openai"
            print(f"[DEBUG] Defaulting to OpenAI key for {model_name}")
        
        if not api_key:
            raise HTTPException(status_code=404, detail=f"API key not found for model: {model_name}")
        
        return {
            "model_name": model_name,
            "api_key": api_key,
            "provider": provider
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving API key: {str(e)}")

# -----------------------------
# ROOT ROUTES
# -----------------------------

@app.get("/")
async def root():
    return {
        "message": "Database Management API v2",
        "version": "2.0.0",
        "status": "running",
        "documentation": "/docs",
        "endpoints": {
            "utilisateurs": "/api/utilisateurs",
            "chercheurs": "/api/chercheurs",
            "api_keys": "/api/cles-api"
        }
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0"}

# -----------------------------
# CREATE TABLES
# -----------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8020)
