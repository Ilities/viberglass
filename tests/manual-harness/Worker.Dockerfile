FROM viberator-worker-multi-agent:local
USER root
COPY apps/viberator/dist /app/apps/viberator/dist
COPY packages/types/dist /app/packages/types/dist
COPY packages/telemetry/dist /app/packages/telemetry/dist
COPY packages/agent-core/dist /app/packages/agent-core/dist
COPY packages/agents/agent-fake/dist /app/packages/agents/agent-fake/dist
COPY packages/agents/agent-antigravity/dist /app/packages/agents/agent-antigravity/dist
COPY packages/agents/agent-kimi/dist /app/packages/agents/agent-kimi/dist
COPY packages/agents/agent-qwen/dist /app/packages/agents/agent-qwen/dist
COPY packages/agents/agent-pi/dist /app/packages/agents/agent-pi/dist
COPY packages/agents/agent-mistral-vibe/dist /app/packages/agents/agent-mistral-vibe/dist
COPY packages/agents/agent-codex/dist /app/packages/agents/agent-codex/dist
COPY packages/agents/agent-claude-code/dist /app/packages/agents/agent-claude-code/dist
COPY packages/agents/agent-opencode/dist /app/packages/agents/agent-opencode/dist

COPY packages/agents/agent-fake/package.json /app/packages/agents/agent-fake/package.json
RUN ln -sfn ../../packages/agents/agent-fake /app/node_modules/@viberglass/agent-fake
COPY packages/agents/agent-antigravity/package.json /app/packages/agents/agent-antigravity/package.json
RUN ln -sfn ../../packages/agents/agent-antigravity /app/node_modules/@viberglass/agent-antigravity
COPY packages/agents/agent-kimi/package.json /app/packages/agents/agent-kimi/package.json
RUN ln -sfn ../../packages/agents/agent-kimi /app/node_modules/@viberglass/agent-kimi
COPY packages/agents/agent-qwen/package.json /app/packages/agents/agent-qwen/package.json
RUN ln -sfn ../../packages/agents/agent-qwen /app/node_modules/@viberglass/agent-qwen
COPY packages/agents/agent-pi/package.json /app/packages/agents/agent-pi/package.json
RUN ln -sfn ../../packages/agents/agent-pi /app/node_modules/@viberglass/agent-pi
COPY packages/agents/agent-mistral-vibe/package.json /app/packages/agents/agent-mistral-vibe/package.json
RUN ln -sfn ../../packages/agents/agent-mistral-vibe /app/node_modules/@viberglass/agent-mistral-vibe
COPY packages/agents/agent-codex/package.json /app/packages/agents/agent-codex/package.json
RUN ln -sfn ../../packages/agents/agent-codex /app/node_modules/@viberglass/agent-codex
COPY packages/agents/agent-claude-code/package.json /app/packages/agents/agent-claude-code/package.json
RUN ln -sfn ../../packages/agents/agent-claude-code /app/node_modules/@viberglass/agent-claude-code
COPY packages/agents/agent-opencode/package.json /app/packages/agents/agent-opencode/package.json
RUN ln -sfn ../../packages/agents/agent-opencode /app/node_modules/@viberglass/agent-opencode
RUN npm install -g @earendil-works/pi-coding-agent@^1.0.0 pi-acp
USER viberator
