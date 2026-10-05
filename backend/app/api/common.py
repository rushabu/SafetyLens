from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from fastapi import Query

from ..services.query import DEFAULT_SOURCE_TYPES, Filters


def iso(dt: datetime | date | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat() + "Z"
    return dt.isoformat()


def filters_dep(
    date_from: date | None = None,
    date_to: date | None = None,
    site: list[str] = Query(default=[]),
    activity: list[str] = Query(default=[]),
    source_type: list[str] = Query(default=[]),
    include_near_duplicates: bool = True,
    view: Literal["model", "reviewed"] = "model",
) -> Filters:
    return Filters(
        date_from=date_from,
        date_to=date_to,
        sites=[s for s in site if s],
        activities=[a for a in activity if a],
        source_types=[s for s in source_type if s] or list(DEFAULT_SOURCE_TYPES),
        include_near_duplicates=include_near_duplicates,
        view=view,
    )
