FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # ذاكرة تخزين HuggingFace مؤقتة داخل نفس الـvolume الدائم (asr_models) —
    # لا تُعاد أوزان النموذج الأصلية (قبل التحويل) عند إعادة بناء الحاوية.
    HF_HOME=/models/hf-cache

# libgomp1: OpenMP runtime التي يحتاجها CTranslate2/PyTorch على CPU.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8090

# healthcheck منفصل في docker-compose.yml (بلا منفذ مكشوف للمضيف — شبكة compose فقط)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
