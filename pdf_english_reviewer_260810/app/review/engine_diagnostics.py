from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any


@dataclass
class EngineDiagnosticStats:
    requested_units: int = 0
    sent_units: int = 0
    http_requests: int = 0
    response_units: int = 0
    skipped_units: int = 0
    failed_units: int = 0
    raw_findings: int = 0
    emitted_findings: int = 0
    filtered_findings: int = 0
    skip_reasons: Counter[str] = field(default_factory=Counter)
    filter_reasons: Counter[str] = field(default_factory=Counter)
    error_types: Counter[str] = field(default_factory=Counter)

    def snapshot(self) -> dict[str, Any]:
        return {
            "requested_units": self.requested_units,
            "sent_units": self.sent_units,
            "http_requests": self.http_requests,
            "response_units": self.response_units,
            "skipped_units": self.skipped_units,
            "failed_units": self.failed_units,
            "raw_findings": self.raw_findings,
            "emitted_findings": self.emitted_findings,
            "filtered_findings": self.filtered_findings,
            "skip_reasons": dict(sorted(self.skip_reasons.items())),
            "filter_reasons": dict(sorted(self.filter_reasons.items())),
            "error_types": dict(sorted(self.error_types.items())),
        }


class EngineDiagnostics:
    def __init__(self, engines: list[str] | tuple[str, ...] = ("languagetool", "ollama")) -> None:
        self._stats = {engine: EngineDiagnosticStats() for engine in engines}

    def _engine(self, engine: str) -> EngineDiagnosticStats:
        if engine not in self._stats:
            self._stats[engine] = EngineDiagnosticStats()
        return self._stats[engine]

    def record_requested(self, engine: str) -> None:
        self._engine(engine).requested_units += 1

    def record_sent(self, engine: str) -> None:
        self._engine(engine).sent_units += 1

    def record_http_request(self, engine: str, count: int = 1) -> None:
        self._engine(engine).http_requests += count

    def record_response(self, engine: str, *, raw_findings: int, emitted_findings: int) -> None:
        stats = self._engine(engine)
        stats.response_units += 1
        stats.raw_findings += max(0, raw_findings)
        stats.emitted_findings += max(0, emitted_findings)

    def record_skip(self, engine: str, reason: str) -> None:
        stats = self._engine(engine)
        stats.skipped_units += 1
        stats.skip_reasons[reason] += 1

    def record_failure(self, engine: str, error_type: str) -> None:
        stats = self._engine(engine)
        stats.failed_units += 1
        stats.error_types[error_type] += 1

    def record_filtered(self, engine: str, reason: str, count: int = 1) -> None:
        stats = self._engine(engine)
        stats.filtered_findings += count
        stats.filter_reasons[reason] += count

    def snapshot(self) -> dict[str, Any]:
        return {engine: stats.snapshot() for engine, stats in sorted(self._stats.items())}
