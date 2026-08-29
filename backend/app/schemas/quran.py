from pydantic import BaseModel


class SurahOut(BaseModel):
    number: int
    name: str
    ayah_count: int
