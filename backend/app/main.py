"""FastAPI application entry point."""

import time
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.api.v1.router import api_router
from app.logging_config import api_logger, generate_request_id

settings = get_settings()

app = FastAPI(
    title="Cricket Management API",
    description="Backend API for Cricket Management Game - Match simulation and event generation",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests and responses with payloads."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip logging for health checks and docs
        if request.url.path in ("/health", "/", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        request_id = generate_request_id()
        start_time = time.time()

        # Read and log request payload for POST requests
        payload = None
        if request.method == "POST":
            try:
                body = await request.body()
                if body:
                    import json
                    payload = json.loads(body)
            except Exception:
                payload = {"_error": "Could not parse request body"}

        api_logger.log_request(
            request_id=request_id,
            endpoint=request.url.path,
            method=request.method,
            payload=payload,
        )

        # Process request
        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000

            # For successful responses, we'd need to read the body
            # but that requires more complex handling - log status only
            api_logger.log_response(
                request_id=request_id,
                endpoint=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )

            return response

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            api_logger.log_response(
                request_id=request_id,
                endpoint=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
                error=str(e),
            )
            raise


# Add logging middleware first (outermost)
app.add_middleware(RequestLoggingMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Cricket Management API",
        "version": "0.1.0",
        "docs": "/docs" if settings.debug else "disabled",
    }
