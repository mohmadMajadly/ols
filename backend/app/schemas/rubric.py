from pydantic import BaseModel, field_validator


class RubricOut(BaseModel):
    weights: dict[str, float]
    deductions: dict[str, dict[str, float]]


class RubricUpdate(BaseModel):
    weights: dict[str, float]
    deductions: dict[str, dict[str, float]]

    @field_validator("weights")
    @classmethod
    def _validate_weights(cls, value: dict[str, float]) -> dict[str, float]:
        if any(v < 0 for v in value.values()):
            raise ValueError("قيم الأوزان يجب أن تكون أكبر من أو تساوي صفر")
        if abs(sum(value.values()) - 100) > 1e-9:
            raise ValueError("مجموع الأوزان يجب أن يساوي 100")
        return value

    @field_validator("deductions")
    @classmethod
    def _validate_deductions(cls, value: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
        for category, modes in value.items():
            for mode, amount in modes.items():
                if amount < 0:
                    raise ValueError("قيم الخصومات يجب أن تكون أكبر من أو تساوي صفر")
        return value
