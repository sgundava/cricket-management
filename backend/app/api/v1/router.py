"""API v1 router combining all endpoints."""

from fastapi import APIRouter

from app.api.v1 import match, events

api_router = APIRouter()

api_router.include_router(match.router, prefix="/match", tags=["Match Simulation"])
api_router.include_router(events.router, prefix="/events", tags=["Events"])
