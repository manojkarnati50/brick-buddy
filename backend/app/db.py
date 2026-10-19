"""SQLite schema (SQLModel)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import settings

engine = create_engine(f"sqlite:///{settings.db_path}", connect_args={"check_same_thread": False})


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    """ISO-8601 in UTC with a Z suffix (SQLite may hand back naive datetimes)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


STATUSES = ["Generated", "Printing", "Printed", "Built", "Archived"]


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    request_text: str = ""
    request_audio: Optional[str] = None       # file name in uploads/
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    status: str = "Generated"
    current_version: int = 1
    thumbnail: Optional[str] = None           # thumbs/<file>
    photo: Optional[str] = None               # uploads/<file> real printed build
    mpd_path: Optional[str] = None            # models/<file>
    model_used: str = "demo"
    cost_usd: float = 0.0
    favourite: bool = False
    from_inventory: bool = False
    source: str = "claude"                    # claude | demo | example | copy
    narration: str = ""                       # short cheerful line read aloud
    piece_count: int = 0
    town_x: Optional[int] = None              # placement on her town baseplate
    town_z: Optional[int] = None
    built_at: Optional[datetime] = None
    printed_at: Optional[datetime] = None


class ProjectVersion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    version: int
    mpd_path: str
    thumbnail: Optional[str] = None
    bom_json: str = "[]"
    created_by: str = "Claude"                # Claude | Aaradya painted | Parent edit
    note: str = ""
    created_at: datetime = Field(default_factory=now)

    @property
    def bom(self) -> list[dict]:
        return json.loads(self.bom_json or "[]")


class ProjectPart(SQLModel, table=True):
    """BOM line for the project's *current* version."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    part: str
    colour: int
    quantity: int
    printed: int = 0                          # how many of this line were printed (partial printing)


class InventoryItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    part: str = Field(index=True)
    colour: int = Field(index=True)
    quantity: int = 0                         # total bricks we own (incl. ones locked in Built models)


class InventoryLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=now)
    part: str
    colour: int
    delta: int
    reason: str
    project_id: Optional[int] = None
    batch: Optional[str] = None               # groups lines so a whole action can be undone
    undone: bool = False


class Sticker(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str                                 # created | printed | built | painted | story | game
    emoji: str
    label: str
    project_id: Optional[int] = None
    created_at: datetime = Field(default_factory=now)


class ApiCall(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=now)
    model: str
    purpose: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    ok: bool = True


class ColourEvent(SQLModel, table=True):
    """Colours she asks for or paints with (feeds the favourite colours chart)."""
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=now)
    colour: int
    source: str                               # asked | painted
    count: int = 1


class UsageDay(SQLModel, table=True):
    """Kid-mode minutes per day (time limit + day streak)."""
    day: str = Field(primary_key=True)        # YYYY-MM-DD
    seconds: int = 0
    builds: int = 0


class BigBuild(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=now)
    idea: str
    status: str = "waiting"                   # waiting | approved | running | done | rejected | failed
    project_id: Optional[int] = None
    note: str = ""


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


DEFAULT_SETTINGS = {
    "pin_hash": "",
    "mute": "false",
    "voice_on": "true",
    "language": "en",              # en | te | both
    "voice_provider": "browser",   # browser | sarvam
    "daily_minutes": "45",
    "monthly_cap_usd": "5",
    "calls_per_minute": "4",
    "calls_per_day": "60",
    "inventory_mode": "strict",    # strict | mostly
    "mostly_extra": "5",
    "printable_colours": json.dumps([4, 13, 14, 25, 1, 9, 2, 27, 22, 15, 0, 6, 19]),
    "only_inventory_colours": "false",
    "avatar": json.dumps({"style": "photo", "outfit": "cherry", "accessory": "bow", "headphones": False,
                          "background": "#DDF2E6", "brick_colour": 13}),
    "child_name": "Aaradya",
    "filament_g_per_cm3": "1.24",
    "infill": "0.35",
    "suggestions_cache": "",
}


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for k, v in DEFAULT_SETTINGS.items():
            if not s.get(Setting, k):
                s.add(Setting(key=k, value=v))
        s.commit()


def get_session():
    with Session(engine) as s:
        yield s


def get_setting(s: Session, key: str) -> str:
    row = s.get(Setting, key)
    return row.value if row else DEFAULT_SETTINGS.get(key, "")


def set_setting(s: Session, key: str, value: str) -> None:
    row = s.get(Setting, key)
    if row:
        row.value = value
    else:
        s.add(Setting(key=key, value=value))
    s.commit()


def get_json(s: Session, key: str):
    try:
        return json.loads(get_setting(s, key))
    except Exception:
        return json.loads(DEFAULT_SETTINGS[key])


__all__ = ["engine", "select", "Session", "now", "iso", "init_db", "get_session", "get_setting", "set_setting", "get_json",
           "Project", "ProjectVersion", "ProjectPart", "InventoryItem", "InventoryLog", "Sticker", "ApiCall",
           "ColourEvent", "UsageDay", "BigBuild", "Setting", "STATUSES"]
