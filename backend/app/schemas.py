from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ProductInput(BaseModel):
    # Product responses may be sent back by the editor; only these fields are writable.
    model_config = ConfigDict(extra="ignore")
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    category: Literal["saree", "suit"]
    description: str = Field(min_length=1, max_length=3000)
    price_minor: int | None = Field(default=None, ge=0, le=100_000_000)
    currency: str = "INR"
    sizes: str = Field(default="", max_length=200)

    @field_validator("sku", "name", "description")
    @classmethod
    def not_blank(cls, v):
        if not v.strip():
            raise ValueError("This field cannot be blank")
        return v.strip()

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, v):
        return v.upper()

    @field_validator("currency")
    @classmethod
    def currency_code(cls, v):
        v = v.upper().strip()
        if v not in {"INR", "USD", "EUR", "GBP", "AED"}:
            raise ValueError("Choose INR, USD, EUR, GBP or AED")
        return v


class ProductEdit(ProductInput):
    version: int = Field(ge=1)


class VersionInput(BaseModel):
    version: int = Field(ge=1)


class ReferenceInput(VersionInput):
    asset_id: str


class ReviewInput(VersionInput):
    approved: bool
    public: bool


class CropInput(BaseModel):
    product_id: str
    page: int = Field(ge=0)
    x: float = Field(ge=0, le=1, allow_inf_nan=False)
    y: float = Field(ge=0, le=1, allow_inf_nan=False)
    width: float = Field(gt=0, le=1, allow_inf_nan=False)
    height: float = Field(gt=0, le=1, allow_inf_nan=False)
    role: Literal["main", "reverse", "detail"] = "main"


class CatalogGenerate(VersionInput):
    prompt: str = Field(default="", max_length=1000)
    idempotency_key: str = Field(min_length=8, max_length=100)


class TryOnGenerate(BaseModel):
    user_image_id: str
    product_id: str
    idempotency_key: str = Field(min_length=8, max_length=100)


class MerchantLogin(BaseModel):
    token: str = Field(max_length=200)
