from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    COOKIE_SECURE: bool = False
    ADMIN_USERNAME: str | None = None
    ADMIN_PASSWORD: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
