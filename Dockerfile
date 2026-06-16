FROM python:3.11-slim

ARG APP_COMMIT_SHA=unknown
ARG APP_BUILD_TIME=unknown

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=8765
ENV APP_DATA_DIR=/data
ENV APP_COMMIT_SHA=${APP_COMMIT_SHA}
ENV APP_BUILD_TIME=${APP_BUILD_TIME}
ENV APP_ENVIRONMENT=production

WORKDIR /srv/stroitelnyi-kontur

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tools ./tools
COPY src ./src
COPY tests ./tests
COPY qa-artifacts ./qa-artifacts
COPY CODEX_RULES.md package.json playwright.config.ts ./

EXPOSE 8765

CMD ["python", "app/server.py"]
