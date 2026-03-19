"""
db.py — MySQL database layer for SpendWise
Handles connection pooling, schema creation, and all CRUD helpers.
"""

import os
import re
from datetime import datetime
from contextlib import contextmanager
from pathlib import Path
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import pooling, Error as MySQLError

# ─── LOAD ENV ─────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

DB_CONFIG = {
    "host":     os.getenv("DB_HOST",     "localhost"),
    "port":     int(os.getenv("DB_PORT", "3306")),
    "database": os.getenv("DB_NAME",     "spendwise"),
    "user":     os.getenv("DB_USER",     "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "charset":  "utf8mb4",
    "use_unicode": True,
    "autocommit": False,
}

# ─── CONNECTION POOL ──────────────────────────────────────
_pool: pooling.MySQLConnectionPool | None = None

def _get_pool() -> pooling.MySQLConnectionPool:
    global _pool
    if _pool is None:
        cfg = {**DB_CONFIG, "pool_name": "spendwise_pool", "pool_size": 10}
        _pool = pooling.MySQLConnectionPool(**cfg)
    return _pool

@contextmanager
def get_conn():
    """Context manager — yields (connection, cursor), commits on success, rolls back on error."""
    conn = _get_pool().get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        yield conn, cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

# ─── SCHEMA INIT ──────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(20)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    currency    VARCHAR(5)   NOT NULL DEFAULT '₹',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(20)  NOT NULL,
    type        ENUM('income','expense','recurring') NOT NULL DEFAULT 'expense',
    amount      DECIMAL(15,2) NOT NULL,
    category    VARCHAR(60)  NOT NULL,
    description VARCHAR(255) DEFAULT '',
    date        DATE         NOT NULL,
    recurring   TINYINT(1)   NOT NULL DEFAULT 0,
    period      VARCHAR(20)  DEFAULT 'monthly',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
    INDEX idx_tx_username (username),
    INDEX idx_tx_date     (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS budgets (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(20)  NOT NULL,
    category    VARCHAR(60)  NOT NULL,
    `limit`     DECIMAL(15,2) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_user_cat (username, category),
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS goals (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(20)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    target      DECIMAL(15,2) NOT NULL,
    current_amt DECIMAL(15,2) NOT NULL DEFAULT 0,
    deadline    DATE         DEFAULT NULL,
    color       VARCHAR(10)  DEFAULT '#00e5a0',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
    INDEX idx_goals_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""

def init_db():
    """Create all tables if they don't exist. Called on startup."""
    with get_conn() as (conn, cursor):
        for statement in SCHEMA_SQL.strip().split(";"):
            stmt = statement.strip()
            if stmt:
                cursor.execute(stmt)
    print("✅  MySQL schema ready.")

# ═══════════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════════

def user_exists(username: str) -> bool:
    with get_conn() as (_, cur):
        cur.execute("SELECT 1 FROM users WHERE LOWER(username)=LOWER(%s)", (username,))
        return cur.fetchone() is not None


def create_user(username: str, password: str, name: str, currency: str) -> dict:
    with get_conn() as (_, cur):
        cur.execute(
            "INSERT INTO users (username, password, name, currency) VALUES (%s,%s,%s,%s)",
            (username, password, name, currency)
        )
    return get_user(username)


def get_user(username: str) -> dict | None:
    with get_conn() as (_, cur):
        cur.execute(
            "SELECT id, username, name, currency, created_at FROM users WHERE LOWER(username)=LOWER(%s)",
            (username,)
        )
        row = cur.fetchone()
        if row:
            row["created_at"] = str(row["created_at"])
        return row


def verify_user(username: str, password: str) -> dict | None:
    """Returns safe user dict if credentials match, else None."""
    with get_conn() as (_, cur):
        cur.execute(
            "SELECT id, username, password, name, currency FROM users WHERE LOWER(username)=LOWER(%s)",
            (username,)
        )
        row = cur.fetchone()
    if row and row["password"] == password:
        return {k: v for k, v in row.items() if k != "password"}
    return None


def update_user(username: str, name: str, currency: str) -> dict:
    with get_conn() as (_, cur):
        cur.execute(
            "UPDATE users SET name=%s, currency=%s WHERE username=%s",
            (name, currency, username)
        )
    u = get_user(username)
    if not u:
        raise ValueError("User not found")
    return u

# ═══════════════════════════════════════════════════════════
# TRANSACTIONS
# ═══════════════════════════════════════════════════════════

def _row_to_tx(row: dict) -> dict:
    """Normalise DB row → frontend-friendly dict."""
    return {
        "id":          row["id"],
        "username":    row["username"],
        "type":        row["type"],
        "amount":      float(row["amount"]),
        "category":    row["category"],
        "description": row["description"] or "",
        "date":        str(row["date"]),
        "recurring":   bool(row["recurring"]),
        "period":      row["period"] or "monthly",
        "created_at":  str(row["created_at"]),
    }


def get_transactions(username: str) -> list[dict]:
    with get_conn() as (_, cur):
        cur.execute(
            "SELECT * FROM transactions WHERE username=%s ORDER BY date DESC, id DESC",
            (username,)
        )
        return [_row_to_tx(r) for r in cur.fetchall()]


def add_transaction(username: str, tx_type: str, amount: float,
                    category: str, description: str, date: str,
                    recurring: bool, period: str) -> dict:
    with get_conn() as (_, cur):
        cur.execute(
            """INSERT INTO transactions
               (username, type, amount, category, description, date, recurring, period)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (username, tx_type, amount, category, description,
             date or datetime.now().strftime("%Y-%m-%d"),
             int(recurring), period)
        )
        new_id = cur.lastrowid
    # fetch back for consistent response
    with get_conn() as (_, cur):
        cur.execute("SELECT * FROM transactions WHERE id=%s", (new_id,))
        return _row_to_tx(cur.fetchone())


def delete_transaction(tx_id: int, username: str) -> bool:
    with get_conn() as (_, cur):
        cur.execute(
            "DELETE FROM transactions WHERE id=%s AND username=%s",
            (tx_id, username)
        )
        return cur.rowcount > 0

# ═══════════════════════════════════════════════════════════
# BUDGETS
# ═══════════════════════════════════════════════════════════

def get_budgets(username: str) -> dict:
    """Returns {category: limit} for the user."""
    with get_conn() as (_, cur):
        cur.execute(
            "SELECT category, `limit` FROM budgets WHERE username=%s",
            (username,)
        )
        return {r["category"]: float(r["limit"]) for r in cur.fetchall()}


def set_budget(username: str, category: str, limit: float) -> bool:
    """Insert or update budget using ON DUPLICATE KEY."""
    with get_conn() as (_, cur):
        cur.execute(
            """INSERT INTO budgets (username, category, `limit`)
               VALUES (%s,%s,%s)
               ON DUPLICATE KEY UPDATE `limit`=%s""",
            (username, category, limit, limit)
        )
    return True


def delete_budget(username: str, category: str) -> bool:
    with get_conn() as (_, cur):
        cur.execute(
            "DELETE FROM budgets WHERE username=%s AND category=%s",
            (username, category)
        )
        return cur.rowcount > 0

# ═══════════════════════════════════════════════════════════
# GOALS
# ═══════════════════════════════════════════════════════════

def _row_to_goal(row: dict) -> dict:
    return {
        "id":          row["id"],
        "username":    row["username"],
        "name":        row["name"],
        "target":      float(row["target"]),
        "current":     float(row["current_amt"]),
        "deadline":    str(row["deadline"]) if row["deadline"] else None,
        "color":       row["color"] or "#00e5a0",
        "created_at":  str(row["created_at"]),
    }


def get_goals(username: str) -> list[dict]:
    with get_conn() as (_, cur):
        cur.execute(
            "SELECT * FROM goals WHERE username=%s ORDER BY created_at DESC",
            (username,)
        )
        return [_row_to_goal(r) for r in cur.fetchall()]


def add_goal(username: str, name: str, target: float, current: float,
             deadline: str | None, color: str) -> dict:
    with get_conn() as (_, cur):
        cur.execute(
            """INSERT INTO goals (username, name, target, current_amt, deadline, color)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (username, name, target, current,
             deadline if deadline else None, color or "#00e5a0")
        )
        new_id = cur.lastrowid
    with get_conn() as (_, cur):
        cur.execute("SELECT * FROM goals WHERE id=%s", (new_id,))
        return _row_to_goal(cur.fetchone())


def update_goal(goal_id: int, username: str, current: float | None = None,
                name: str | None = None) -> dict | None:
    with get_conn() as (_, cur):
        if current is not None and name is not None:
            cur.execute(
                "UPDATE goals SET current_amt=%s, name=%s WHERE id=%s AND username=%s",
                (current, name, goal_id, username)
            )
        elif current is not None:
            cur.execute(
                "UPDATE goals SET current_amt=%s WHERE id=%s AND username=%s",
                (current, goal_id, username)
            )
        elif name is not None:
            cur.execute(
                "UPDATE goals SET name=%s WHERE id=%s AND username=%s",
                (name, goal_id, username)
            )
        if cur.rowcount == 0:
            return None
    with get_conn() as (_, cur):
        cur.execute("SELECT * FROM goals WHERE id=%s", (goal_id,))
        row = cur.fetchone()
        return _row_to_goal(row) if row else None


def delete_goal(goal_id: int, username: str) -> bool:
    with get_conn() as (_, cur):
        cur.execute(
            "DELETE FROM goals WHERE id=%s AND username=%s",
            (goal_id, username)
        )
        return cur.rowcount > 0