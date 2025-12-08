-- Create ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'direction', 'agent_controle', 'agent_hygiene', 'securite');
CREATE TYPE tour_status AS ENUM ('PREPARATION', 'PRET_A_PARTIR', 'EN_TOURNEE', 'EN_ATTENTE_DECHARGEMENT', 'EN_ATTENTE_HYGIENE', 'TERMINEE');
CREATE TYPE conflict_status AS ENUM ('EN_ATTENTE', 'PAYEE', 'ANNULE');

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    nom_complet VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drivers table
CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    nom_complet VARCHAR(255) NOT NULL,
    matricule_par_defaut VARCHAR(50),
    marque_vehicule VARCHAR(100),
    poids_tare_vehicule DECIMAL(10, 2),
    tolerance_caisses_mensuelle INTEGER DEFAULT 0,
    statut VARCHAR(50) DEFAULT 'A_L_USINE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Secteurs table
CREATE TABLE secteurs (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Caisse Config table
CREATE TABLE caisse_configs (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    valeur_tnd DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Produits table
CREATE TABLE produits (
    id SERIAL PRIMARY KEY,
    code_article VARCHAR(50) NOT NULL UNIQUE,
    nom VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tours (Tournées) table
CREATE TABLE tours (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    secteur_id INTEGER NOT NULL REFERENCES secteurs(id),
    agent_controle_id INTEGER REFERENCES users(id),
    agent_hygiene_id INTEGER REFERENCES users(id),
    securite_id_sortie INTEGER REFERENCES users(id),
    securite_id_entree INTEGER REFERENCES users(id),
    
    matricule_vehicule VARCHAR(50),
    
    -- Caisses
    nbre_caisses_depart INTEGER NOT NULL,
    nbre_caisses_retour INTEGER,
    
    -- Poids
    poids_net_produits_depart DECIMAL(10, 2),
    poids_brut_securite DECIMAL(10, 2),
    poids_tare_securite DECIMAL(10, 2),
    poids_net_total_calcule DECIMAL(10, 2),
    
    -- Photo
    photo_preuve_depart_url TEXT,
    
    -- Timestamps
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_sortie_securite TIMESTAMP,
    date_entree_securite TIMESTAMP,
    date_retour_controle TIMESTAMP,
    date_cloture TIMESTAMP,
    
    statut tour_status DEFAULT 'PREPARATION',
    
    produits_retournes BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ligne Retour Produit table
CREATE TABLE ligne_retour_produits (
    id SERIAL PRIMARY KEY,
    tour_id INTEGER NOT NULL REFERENCES tours(id),
    produit_id INTEGER NOT NULL REFERENCES produits(id),
    nbre_caisses INTEGER,
    poids_brut_retour DECIMAL(10, 2),
    poids_net_retour DECIMAL(10, 2),
    note_etat TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conflicts table
CREATE TABLE conflicts (
    id SERIAL PRIMARY KEY,
    tour_id INTEGER NOT NULL REFERENCES tours(id),
    quantite_perdue INTEGER NOT NULL,
    montant_dette_tnd DECIMAL(10, 2) NOT NULL,
    statut conflict_status DEFAULT 'EN_ATTENTE',
    notes_direction TEXT,
    direction_id_approbation INTEGER REFERENCES users(id),
    date_approbation_direction TIMESTAMP,
    depasse_tolerance BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_id INTEGER,
    details_avant TEXT,
    details_apres TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- App Config table
CREATE TABLE app_configs (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id_target INTEGER NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123)
INSERT INTO users (email, password_hash, role, nom_complet) 
VALUES ('admin@caisse.com', '$2a$10$rZ5qX7OvJ5qX7OvJ5qX7OeYxYxYxYxYxYxYxYxYxYxYxYxYxYxY', 'admin', 'Administrateur');

-- Insert default SSID config
INSERT INTO app_configs (key, value) 
VALUES ('ALLOWED_SSIDS', '["WIFI_USINE_PROD", "AndroidWifi"]');

-- Insert default caisse config
INSERT INTO caisse_configs (nom, valeur_tnd) 
VALUES ('Caisse Standard', 5.00);
