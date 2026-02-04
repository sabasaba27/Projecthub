# Compliance AI Backend

## Setup

1. Create a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set environment variables:
   ```bash
   export DATABASE_URL=postgresql://user:password@localhost:5432/compliance_ai
   export OPENAI_API_KEY=your_key
   export OPENAI_MODEL=gpt-4o
   export STORAGE_DIR=/workspace/Projecthub/backend/app/storage
   ```
4. Initialize the database:
   ```bash
   python -m scripts.init_db
   ```
5. Run the API server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Demo Run (Offline)

If you want to run the demo without OpenAI calls, you can disable the client and use SQLite:

```bash
export OPENAI_DISABLED=true
export DATABASE_URL=sqlite:///./compliance_demo.db
export STORAGE_DIR=/workspace/Projecthub/backend/app/storage
python -m scripts.demo_run
```

The report will be written into `backend/app/storage/reports/`.

## Key Endpoints

- `POST /documents/upload` — upload bank documents (PDF/DOCX)
- `POST /regulatory/sources` — register regulatory sources
- `POST /regulatory/ingest/{source_id}` — download + chunk regulatory sources
- `POST /compliance/run` — run compliance checks
- `POST /reports/` — generate reports
- `GET /audit/` — view audit logs
- `GET /downloads/bundle` — download a ZIP of storage artifacts
- `GET /web/` — basic HTML UI for manual testing
