from pathlib import Path

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "console.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)


# Tiny forward-only SQLite "migrations". Each entry is
# (table, column, DDL_type_with_default) and we ADD COLUMN only if the column
# is missing. Kept in code so the dev DB rolls forward on every startup
# without needing Alembic.
_COLUMN_ADDITIONS: list[tuple[str, str, str]] = [
    ("node", "os_family", "TEXT NOT NULL DEFAULT 'debian'"),
]


def _apply_column_additions() -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in _COLUMN_ADDITIONS:
            if table not in inspector.get_table_names():
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {ddl}'))


def init_db() -> None:
    from app.models import cluster, node, project, release  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _apply_column_additions()


def get_session():
    with Session(engine) as session:
        yield session
