from pydantic import BaseModel


class MushafWordOut(BaseModel):
    surah: int
    ayah: int
    word: int
    text_uthmani: str
    glyph: str
    is_ayah_marker: bool


class MushafLineOut(BaseModel):
    line: int
    type: str
    surah: int | None = None
    centered: bool = False
    words: list[MushafWordOut] = []


class MushafPageOut(BaseModel):
    page: int
    lines: list[MushafLineOut]


class MushafPageForOut(BaseModel):
    surah: int
    ayah: int
    page: int
    line: int
