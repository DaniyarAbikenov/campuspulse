FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .
ENV CAMPUSPULSE_MCP_TRANSPORT=streamable-http CAMPUSPULSE_MCP_HOST=0.0.0.0 CAMPUSPULSE_MCP_PORT=8080
EXPOSE 8080
CMD ["python", "-m", "campuspulse_mcp"]
