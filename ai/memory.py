"""Memória de curto prazo da velo ia em SQLite.

Cada conversa guarda até 200 mensagens. A API envia apenas as últimas 15 ao
modelo, o que mantém o contexto recente sem estourar a janela do LLM. O arquivo
do banco fica fora do Git (veja `.gitignore`).
"""

from __future__ import annotations

import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

DEFAULT_HISTORY_LIMIT = 15
MAX_STORED_MESSAGES = 200
CONVERSATION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,80}$")


class MemoryStore:
    """Armazenamento simples e thread-safe para o histórico da conversa."""

    def __init__(self, path: str | Path) -> None:
        self.path = str(Path(path).expanduser().resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _init_schema(self) -> None:
        with self._lock, self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_messages_conversation
                    ON messages (conversation_id, id);
                """
            )

    @staticmethod
    def validate_conversation_id(conversation_id: str) -> str:
        value = conversation_id.strip()
        if not CONVERSATION_ID_RE.fullmatch(value):
            raise ValueError(
                "conversation_id inválido: use de 8 a 80 caracteres entre "
                "letras, números, hífen e sublinhado."
            )
        return value

    def add_message(self, conversation_id: str, role: str, content: str) -> int:
        conversation_id = self.validate_conversation_id(conversation_id)
        if role not in {"user", "assistant"}:
            raise ValueError("role deve ser 'user' ou 'assistant'.")
        text = content.strip()
        if not text:
            raise ValueError("Não é possível salvar uma mensagem vazia.")

        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._lock, self._connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO messages (conversation_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (conversation_id, role, text, created_at),
            )
            message_id = int(cursor.lastrowid or 0)

            # Mantém no máximo 200 mensagens por conversa. O histórico enviado
            # ao modelo é menor (15), mas guardar um pouco mais permite mostrar
            # a conversa na interface e revisar o contexto recente.
            connection.execute(
                """
                DELETE FROM messages
                WHERE conversation_id = ?
                  AND id NOT IN (
                      SELECT id FROM messages
                      WHERE conversation_id = ?
                      ORDER BY id DESC
                      LIMIT ?
                  )
                """,
                (conversation_id, conversation_id, MAX_STORED_MESSAGES),
            )

        return message_id

    def delete_message(self, message_id: int) -> None:
        with self._lock, self._connection() as connection:
            connection.execute("DELETE FROM messages WHERE id = ?", (message_id,))

    def recent_messages(
        self, conversation_id: str, limit: int = DEFAULT_HISTORY_LIMIT
    ) -> list[dict[str, object]]:
        conversation_id = self.validate_conversation_id(conversation_id)
        safe_limit = max(1, min(int(limit), MAX_STORED_MESSAGES))

        with self._lock, self._connection() as connection:
            rows = connection.execute(
                """
                SELECT id, role, content, created_at
                FROM messages
                WHERE conversation_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (conversation_id, safe_limit),
            ).fetchall()

        return [dict(row) for row in reversed(rows)]

    def history(
        self, conversation_id: str, limit: int = 100
    ) -> list[dict[str, object]]:
        conversation_id = self.validate_conversation_id(conversation_id)
        safe_limit = max(1, min(int(limit), MAX_STORED_MESSAGES))

        with self._lock, self._connection() as connection:
            rows = connection.execute(
                """
                SELECT id, role, content, created_at
                FROM messages
                WHERE conversation_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (conversation_id, safe_limit),
            ).fetchall()

        return [dict(row) for row in reversed(rows)]

    def clear(self, conversation_id: str) -> int:
        conversation_id = self.validate_conversation_id(conversation_id)
        with self._lock, self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM messages WHERE conversation_id = ?",
                (conversation_id,),
            )
            return int(cursor.rowcount or 0)

    def count(self, conversation_id: str) -> int:
        conversation_id = self.validate_conversation_id(conversation_id)
        with self._lock, self._connection() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()
        return int(row["total"]) if row else 0
