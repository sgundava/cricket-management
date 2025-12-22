"""Structured logging configuration for analytics and debugging."""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4


class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging - easy to parse for analytics."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add extra fields if present
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        if hasattr(record, "endpoint"):
            log_data["endpoint"] = record.endpoint
        if hasattr(record, "method"):
            log_data["method"] = record.method
        if hasattr(record, "status_code"):
            log_data["status_code"] = record.status_code
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "payload"):
            log_data["payload"] = record.payload
        if hasattr(record, "response"):
            log_data["response"] = record.response
        if hasattr(record, "error"):
            log_data["error"] = record.error

        return json.dumps(log_data, default=str)


class APILogger:
    """Dedicated logger for API request/response logging with analytics-ready format."""

    def __init__(self, name: str = "api"):
        self.logger = logging.getLogger(f"cricket.{name}")
        self.logger.setLevel(logging.INFO)

        # Only add handler if not already present
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(StructuredFormatter())
            self.logger.addHandler(handler)
            self.logger.propagate = False

    def log_request(
        self,
        request_id: str,
        endpoint: str,
        method: str,
        payload: Optional[dict] = None,
    ) -> None:
        """Log incoming API request with payload."""
        extra = {
            "request_id": request_id,
            "endpoint": endpoint,
            "method": method,
            "payload": payload,
        }
        self.logger.info("API Request", extra=extra)

    def log_response(
        self,
        request_id: str,
        endpoint: str,
        status_code: int,
        duration_ms: float,
        response: Optional[dict] = None,
        error: Optional[str] = None,
    ) -> None:
        """Log API response with payload and timing."""
        extra = {
            "request_id": request_id,
            "endpoint": endpoint,
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
        }

        # Include response summary for analytics (not full payload to avoid bloat)
        if response:
            extra["response"] = self._summarize_response(response)

        if error:
            extra["error"] = error
            self.logger.error("API Response", extra=extra)
        else:
            self.logger.info("API Response", extra=extra)

    def _summarize_response(self, response: dict) -> dict:
        """Create analytics-friendly summary of response."""
        summary = {}

        # Match simulation summaries
        if "outcome" in response:
            outcome = response.get("outcome", {})
            summary["outcome_type"] = outcome.get("type")
            if outcome.get("type") == "runs":
                summary["runs"] = outcome.get("runs")
            elif outcome.get("type") == "wicket":
                summary["dismissal"] = outcome.get("dismissal_type")

        if "updated_state" in response:
            state = response["updated_state"]
            summary["score"] = f"{state.get('runs', 0)}/{state.get('wickets', 0)}"
            summary["overs"] = f"{state.get('overs', 0)}.{state.get('balls', 0)}"

        if "over_summary" in response:
            over = response["over_summary"]
            summary["over_number"] = over.get("over_number")
            summary["over_runs"] = over.get("runs")
            summary["over_wickets"] = over.get("wickets")

        # Event summaries
        if "event" in response:
            event = response.get("event")
            if event:
                summary["event_id"] = event.get("id")
                summary["event_category"] = event.get("category")
                summary["event_title"] = event.get("title")
            else:
                summary["event_triggered"] = False

        # Bowler recommendation
        if "recommended_bowler_id" in response:
            summary["recommended_bowler"] = response.get("recommended_bowler_id")

        return summary if summary else {"type": "other"}

    def log_analytics_event(
        self,
        event_type: str,
        data: dict,
        request_id: Optional[str] = None,
    ) -> None:
        """Log custom analytics event for future database storage."""
        extra = {
            "request_id": request_id or str(uuid4()),
            "endpoint": f"analytics/{event_type}",
            "method": "ANALYTICS",
            "payload": data,
        }
        self.logger.info(f"Analytics: {event_type}", extra=extra)


# Global logger instance
api_logger = APILogger()


def generate_request_id() -> str:
    """Generate unique request ID for tracing."""
    return str(uuid4())[:8]