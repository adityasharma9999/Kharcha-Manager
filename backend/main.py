"""
main.py — SpendWise FastAPI backend (MySQL edition)
Run: uvicorn main:app --reload
"""

import re
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

import db  # our MySQL layer

# ─── PATHS ────────────────────────────────────────────────
BASE_DIR     = Path(__file__).parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# ─── APP ──────────────────────────────────────────────────
app = FastAPI(title="SpendWise API", version="2.0.0")

# ─── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── STATIC FILES ─────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# ─── STARTUP — initialise MySQL schema ────────────────────
@app.on_event("startup")
def on_startup():
    try:
        db.init_db()
    except Exception as e:
        print(f"WARNING: DB init failed: {e}")
        print("    Make sure MySQL is running and .env credentials are correct.")

# ─── SERVE FRONTEND ───────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def serve_index():
    idx = FRONTEND_DIR / "index.html"
    if not idx.exists():
        return HTMLResponse("<h1>Frontend not found.</h1>", status_code=404)
    return HTMLResponse(idx.read_text(encoding="utf-8"))

# ═══════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════

@app.post("/signup")
def signup(payload: dict):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")
    name     = payload.get("name", "").strip()
    currency = payload.get("currency", "₹").strip() or "₹"

    if not username or not password or not name:
        return {"status": "fail", "msg": "All fields are required."}
    if not re.match(r"^[a-zA-Z0-9_]{3,20}$", username):
        return {"status": "fail", "msg": "Username: 3-20 chars, letters/numbers/underscore only."}
    if len(password) < 6:
        return {"status": "fail", "msg": "Password must be at least 6 characters."}

    if db.user_exists(username):
        return {"status": "fail", "msg": "Username already taken."}

    try:
        user = db.create_user(username, password, name, currency)
        return {"status": "success", "msg": "Account created!", "user": user}
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.post("/login")
def login(payload: dict):
    username = payload.get("username", "").strip()
    password = payload.get("password", "")

    if not username or not password:
        return {"status": "fail", "msg": "Enter username and password."}

    user = db.verify_user(username, password)
    if user:
        return {"status": "success", "user": user}
    return {"status": "fail", "msg": "Invalid username or password."}


@app.post("/user/update")
def update_user(payload: dict):
    username = payload.get("username", "").strip()
    name     = payload.get("name", "").strip()
    currency = payload.get("currency", "₹").strip() or "₹"

    if not username or not name:
        return {"status": "fail", "msg": "Name is required."}

    try:
        user = db.update_user(username, name, currency)
        return {"status": "updated", "user": user}
    except ValueError:
        raise HTTPException(404, "User not found")
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


# ═══════════════════════════════════════════════════════════
# TRANSACTIONS
# ═══════════════════════════════════════════════════════════

@app.get("/transactions")
def get_transactions(username: str = ""):
    if not username:
        return []
    try:
        return db.get_transactions(username)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.post("/transactions")
def add_transaction(payload: dict):
    username    = payload.get("username", "").strip()
    amount_raw  = payload.get("amount", 0)
    tx_type     = payload.get("type", "expense")
    category    = payload.get("category", "Other").strip()
    description = payload.get("description", "").strip()
    date        = payload.get("date", "").strip()
    recurring   = bool(payload.get("recurring", False))
    period      = payload.get("period", "monthly").strip()

    if not username:
        return {"status": "fail", "msg": "User not identified."}
    try:
        amount = float(amount_raw)
    except (TypeError, ValueError):
        return {"status": "fail", "msg": "Invalid amount."}
    if amount <= 0:
        return {"status": "fail", "msg": "Amount must be greater than 0."}
    if tx_type not in ("income", "expense", "recurring"):
        return {"status": "fail", "msg": "Invalid transaction type."}
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    try:
        tx = db.add_transaction(username, tx_type, amount, category,
                                description, date, recurring, period)
        return {"status": "success", "tx": tx}
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.delete("/transactions/{tx_id}")
def delete_transaction(tx_id: int, username: str = ""):
    if not username:
        raise HTTPException(400, "username query param required")
    try:
        deleted = db.delete_transaction(tx_id, username)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")
    if not deleted:
        raise HTTPException(404, "Transaction not found or not yours")
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════
# BUDGETS
# ═══════════════════════════════════════════════════════════

@app.get("/budgets")
def get_budgets(username: str = ""):
    if not username:
        return {}
    try:
        return db.get_budgets(username)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.post("/budgets")
def set_budget(payload: dict):
    username = payload.get("username", "").strip()
    category = payload.get("category", "").strip()
    try:
        limit = float(payload.get("limit", 0))
    except (TypeError, ValueError):
        return {"status": "fail", "msg": "Invalid limit value."}

    if not username or not category:
        return {"status": "fail", "msg": "username and category are required."}
    if limit <= 0:
        return {"status": "fail", "msg": "Limit must be greater than 0."}

    try:
        db.set_budget(username, category, limit)
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.delete("/budgets/{category}")
def delete_budget(category: str, username: str = ""):
    if not username:
        raise HTTPException(400, "username query param required")
    try:
        deleted = db.delete_budget(username, category)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")
    if not deleted:
        raise HTTPException(404, "Budget not found")
    return {"status": "deleted"}


# ═══════════════════════════════════════════════════════════
# GOALS
# ═══════════════════════════════════════════════════════════

@app.get("/goals")
def get_goals(username: str = ""):
    if not username:
        return []
    try:
        return db.get_goals(username)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.post("/goals")
def add_goal(payload: dict):
    username = payload.get("username", "").strip()
    name     = payload.get("name", "").strip()
    deadline = payload.get("deadline", "").strip() or None
    color    = payload.get("color", "#00e5a0").strip()

    if not username or not name:
        return {"status": "fail", "msg": "username and goal name are required."}
    try:
        target  = float(payload.get("target", 0))
        current = float(payload.get("current", 0))
    except (TypeError, ValueError):
        return {"status": "fail", "msg": "Invalid amount value."}
    if target <= 0:
        return {"status": "fail", "msg": "Target must be greater than 0."}

    try:
        goal = db.add_goal(username, name, target, current, deadline, color)
        return {"status": "success", "goal": goal}
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")


@app.patch("/goals/{goal_id}")
def update_goal(goal_id: int, payload: dict):
    username = payload.get("username", "").strip()
    current  = payload.get("current")
    name     = payload.get("name")

    if current is not None:
        try:
            current = float(current)
        except (TypeError, ValueError):
            return {"status": "fail", "msg": "Invalid amount."}
        if current < 0:
            return {"status": "fail", "msg": "Amount cannot be negative."}

    try:
        goal = db.update_goal(goal_id, username or "%", current, name)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")
    if not goal:
        raise HTTPException(404, "Goal not found")
    return {"status": "updated", "goal": goal}


@app.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, username: str = ""):
    if not username:
        raise HTTPException(400, "username query param required")
    try:
        deleted = db.delete_goal(goal_id, username)
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")
    if not deleted:
        raise HTTPException(404, "Goal not found or not yours")
    return {"status": "deleted"}


# ─── HEALTH CHECK ─────────────────────────────────────────
@app.get("/health")
def health():
    try:
        with db.get_conn() as (_, cur):
            cur.execute("SELECT 1")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {e}"
    return {
        "status":    "ok",
        "database":  db_status,
        "timestamp": datetime.now().isoformat(),
    }