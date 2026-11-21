FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv==0.9.13
WORKDIR /workspace
COPY backend/pyproject.toml backend/uv.lock backend/
RUN uv sync --project backend --locked --no-dev
COPY backend/ backend/
COPY scripts/ scripts/
COPY demo/ demo/
ENV VYUMI_DATA_DIR=/workspace/data VYUMI_GENERATION_MODE=live
EXPOSE 8000
CMD ["backend/.venv/bin/python", "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]
