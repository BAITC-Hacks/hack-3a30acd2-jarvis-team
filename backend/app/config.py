from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / '.env', extra='ignore')
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'taskup.db').as_posix()}"
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'
    demo_mode: bool = True
    llm_provider: str = 'rule_based'
    llm_api_key: str = ''
    llm_base_url: str = 'https://api.openai.com/v1'
    llm_model: str = ''
    llm_timeout_seconds: float = Field(default=20, gt=0, le=120)


settings = Settings()
