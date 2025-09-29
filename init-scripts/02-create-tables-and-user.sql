-- Create minimal setup for the research assistant application
-- Only creates the results database and admin user
-- The niveau_acces_type enum will be created automatically by the application models

-- Users table (matching exact local schema)
CREATE TABLE IF NOT EXISTS utilisateurs (
    id BIGSERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    mot_de_passe_hash TEXT NOT NULL,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    est_admin BOOLEAN DEFAULT FALSE,
    telephone VARCHAR(20),
    est_actif BOOLEAN DEFAULT FALSE
);

-- Researchers table (matching exact local schema)
CREATE TABLE IF NOT EXISTS chercheurs (
    id BIGSERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prenom VARCHAR(255) NOT NULL,
    orcid_id VARCHAR(19) UNIQUE,
    affiliation TEXT,
    domaines_recherche TEXT,
    mots_cles_specifiques TEXT
);

-- API Keys table (matching exact local schema)
CREATE TABLE IF NOT EXISTS cles_api (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT REFERENCES utilisateurs(id) ON DELETE CASCADE,
    cle_openai TEXT,
    cle_gemini TEXT,
    cle_claude TEXT,
    cle_deepseek TEXT,
    cle_scopus TEXT
);

-- Database configurations table (matching exact local schema)
CREATE TABLE IF NOT EXISTS configurations_bases (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT REFERENCES utilisateurs(id) ON DELETE CASCADE,
    nom_base VARCHAR(255) NOT NULL,
    nom_schema VARCHAR(100) NOT NULL,
    type_base VARCHAR(100) NOT NULL,
    hote VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    nom_utilisateur VARCHAR(255) NOT NULL,
    mot_de_passe TEXT NOT NULL
);

-- Database access table (matching exact local schema)
-- Note: niveau_acces_type enum will be created by the backend, so using VARCHAR for now
CREATE TABLE IF NOT EXISTS acces_bases (
    id BIGSERIAL PRIMARY KEY,
    utilisateur_id BIGINT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    configuration_base_id BIGINT NOT NULL REFERENCES configurations_bases(id) ON DELETE CASCADE,
    niveau_acces VARCHAR(20) DEFAULT 'lecture',
    CONSTRAINT unique_user_config UNIQUE (utilisateur_id, configuration_base_id)
);

-- Insert ONLY the default admin user
-- Password hash for 'admin123' using bcrypt (compatible version)
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, est_admin, est_actif)
VALUES (
    'Admin',
    'System',
    'admin@example.com',
    E'$2b$12$TOWKY6pH2SjCtCxIqWMLW.L88NMmU287oHUROvoRmI5tgcaN5x6c2', -- admin123
    TRUE,
    TRUE
) ON CONFLICT (email) DO UPDATE SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash;