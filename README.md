# NE Explore - Transport Module

This directory contains the independent, standalone **Transport Scheduling & Booking System**. It is structured as a decoupled full-stack application with a Django REST Framework backend and a React (TypeScript + Vite) frontend.

---

## Folder Structure

```text
Transport/
├── backend/          # Django Backend API
│   ├── core/         # Settings, URL routing, custom authentication, validators
│   ├── transport/    # Main booking models, business logic, API views, serializers
│   ├── users/        # Custom user model compatible with Supabase metadata
│   ├── venv/         # Local Python virtual environment
│   ├── db.sqlite3    # SQLite development database
│   ├── manage.py     # Django management CLI
│   └── requirements.txt
│
├── frontend/         # React Frontend UI
│   ├── src/          # Source components, assets, services
│   ├── public/       # Static assets
│   ├── vite.config.ts
│   └── package.json
│
├── .gitignore        # Local git exclusion rules
└── README.md         # This setup guide
```

---

## 🛠️ Backend Setup & Run

The backend is built with Django 5.2.9 and Django REST Framework. It uses local SQLite (`db.sqlite3`) for development by default, but supports PostgreSQL (Supabase) via environment variables.

### 1. Prerequisites
- Python 3.10+ installed.

### 2. Configure Environment
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Copy the template `.env.example` file to `.env`:
   ```bash
   copy .env.example .env
   ```
3. Open `.env` and fill out the configuration:
   - `SECRET_KEY`: Set a secure random string.
   - `DEBUG`: Set to `True` for development.
   - `DATABASE_URL`: Leave empty to use SQLite (`db.sqlite3` in the local directory) or paste a PostgreSQL URL.
   - `SUPABASE_URL` and `SUPABASE_KEY`: Put your Supabase project credentials for user JWT authentication.
   - Email configurations (SMTP) to enable email confirmation tickets.

### 3. Run the Server
Using the local virtual environment:
1. Activate the virtual environment (if needed, or directly run python from it):
   - **Windows (Command Prompt):** `venv\Scripts\activate.bat`
   - **Windows (PowerShell):** `.\venv\Scripts\Activate.ps1`
   - **macOS/Linux:** `source venv/bin/activate`
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run migrations:
   ```bash
   python manage.py migrate
   ```
4. Start the Django development server:
   ```bash
   python manage.py runserver 8000
   ```
   *The backend will be available at: http://localhost:8000/*

### 4. Running Backend Tests
Ensure everything functions correctly by running the suite of test cases (checking API search, seats occupancy mapping, transactions, and email logic):
```bash
python manage.py test
```

---

## 💻 Frontend Setup & Run

The frontend is a lightweight Single Page Application built using React 19, TypeScript, and Vite.

### 1. Prerequisites
- Node.js (v18+) and npm installed.

### 2. Setup & Run
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The frontend will run at: http://localhost:5173/*

### 3. Production Build
Verify that the production compilation passes without type errors:
```bash
npm run build
```

---

## 🔗 How They Connect

1. **API Endpoints:**
   The React client communicates with the Django API via `axios`. The endpoint base URL defaults to `http://localhost:8000/api/transport/` (defined in [api.ts](file:///d:/Downloads/hinglishrepot-main/Transport/frontend/src/services/api.ts)).
   
2. **Authentication Flow:**
   The frontend authenticates using **Supabase Auth**. 
   - A request interceptor automatically fetches the active session's JWT (`access_token`) from Supabase.
   - It appends it as a `Bearer <token>` inside the `Authorization` header of API calls.
   - The Django server's custom `SupabaseJWTAuthentication` (defined in [auth.py](file:///d:/Downloads/hinglishrepot-main/Transport/backend/core/auth.py)) intercepts and validates this token against Supabase's JWKS public keys, mapping the Supabase User ID (`sub`) to a local Django `User` account.
