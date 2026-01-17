# Vibug Viberator - AI Agent Orchestrator

A containerized AI agent orchestrator that executes various AI coding CLI tools based on configurations for automated bug fixing.

## Features

- **Multi-Agent Support**: Supports 5 AI agents (Claude Code, Qwen CLI, Mistral Vibe CLI, OpenAI Codex, Gemini CLI)
- **Intelligent Agent Selection**: Automatically selects the best agent based on language, complexity, cost, and success rates
- **Flexible Configuration**: Supports environment variables and AWS Systems Manager Parameter Store
- **Docker Ready**: Fully containerized with proper security and resource management
- **Dual Mode Operation**: HTTP API server mode and CLI execution mode
- **Comprehensive Logging**: Structured logging with configurable levels and formats

## Supported AI Agents

| Agent        | Capabilities                        | Cost/Execution | Avg Success Rate |
|--------------|-------------------------------------|----------------|------------------|
| Claude Code  | Python, JS, TS, Java, Go, Rust, C++ | $0.50          | 85%              |
| Qwen CLI     | Python, JS, TS, Java, C++           | $0.30          | 78%              |
| OpenAI Codex | Python, JS, TS, Java, Go, C++, C#   | $0.75          | 82%              |
| Mistral Vibe | Python, JS, TS, Rust, Go            | $0.40          | 80%              |
| Gemini CLI   | Python, JS, TS, Java, Kotlin, Swift | $0.35          | 77%              |

## Quick Start

### Using Docker (Recommended)

1. **Clone and build the container:**
```bash
git clone <repository-url>
cd vibug-viberator
cp .env.example .env
# Edit .env with your API keys and configuration
docker build -t vibug-viberator .
```

2. **Run in server mode:**
```bash
docker run -d \
  --name vibug-viberator \
  --env-file .env \
  -p 3000:3000 \
  vibug-viberator
```

3. **Run in CLI mode:**
```bash
docker run --rm \
  --env-file .env \
  -e MODE=cli \
  -e REPO_URL=https://github.com/example/repo.git \
  -e BUG_DESCRIPTION="Fix null pointer exception" \
  vibug-viberator
```

### Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Build the project:**
```bash
npm run build
```

3. **Start in development mode:**
```bash
npm run dev
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

#### Required Configuration
```bash
# Agent API Keys (at least one required)
CLAUDE_CODE_API_KEY=your_claude_api_key
QWEN_CLI_API_KEY=your_qwen_api_key
CODEX_API_KEY=your_openai_api_key
MISTRAL_VIBE_API_KEY=your_mistral_api_key
GEMINI_CLI_API_KEY=your_gemini_api_key
```

#### Optional Configuration
```bash
# Application Settings
MODE=server              # 'server' or 'cli'
PORT=3000               # HTTP server port
LOG_LEVEL=info          # debug, info, warn, error
LOG_FORMAT=json         # json or text

# AWS SSM Integration
AWS_REGION=us-west-2
SSM_PARAMETER_PATH=/vibug-viberator

# Execution Settings
MAX_CONCURRENT_JOBS=3
DEFAULT_TIMEOUT=2700    # 45 minutes
RETRY_ATTEMPTS=2
```

### AWS Systems Manager Parameter Store

For production deployments, store sensitive configuration in AWS SSM:

```bash
# Example SSM parameters
/vibug-viberator/agents/claude-code/apiKey
/vibug-viberator/agents/qwen-cli/apiKey
/vibug-viberator/logging/level
/vibug-viberator/execution/maxConcurrentJobs
```

## API Reference

### Server Mode Endpoints

#### Health Check
```http
GET /health
```

#### Execute Bug Fix
```http
POST /execute
Content-Type: application/json

{
  "bugReport": {
    "id": "bug-001",
    "title": "Null pointer exception in user service",
    "description": "Application crashes when user data is null",
    "stepsToReproduce": "1. Login 2. Navigate to profile 3. Clear session",
    "expectedBehavior": "Should handle null gracefully",
    "actualBehavior": "Application crashes with NPE",
    "severity": "high",
    "language": "java"
  },
  "projectSettings": {
    "repoUrl": "https://github.com/example/repo.git",
    "branch": "main",
    "testingRequired": true,
    "codingStandards": "Google Java Style"
  }
}
```

#### Check Execution Status
```http
GET /execution/{executionId}/status
```

#### List Available Agents
```http
GET /agents
```

## Agent Selection Algorithm

The orchestrator selects agents based on:

1. **Language Compatibility (40%)**: Agent supports the project's programming language
2. **Framework Support (20%)**: Agent supports the specific framework
3. **Success Rate (20%)**: Historical success rate of the agent
4. **Cost Efficiency (10%)**: Lower cost per execution
5. **User Preference (10%)**: Preferred agents in project settings

Special considerations:
- Critical bugs prefer agents with >80% success rate
- Cost limits are enforced per project settings
- Execution time limits prevent infinite runs

## Usage Examples

### Example 1: Python Bug Fix

```bash
docker run --rm --env-file .env \
  -e MODE=cli \
  -e REPO_URL=https://github.com/example/python-app.git \
  -e BRANCH=develop \
  -e LANGUAGE=python \
  -e BUG_DESCRIPTION="Import error in authentication module" \
  -e STEPS_TO_REPRODUCE="1. Run python app.py 2. Error occurs" \
  -e EXPECTED_BEHAVIOR="App should start normally" \
  -e ACTUAL_BEHAVIOR="ModuleNotFoundError: No module named 'auth'" \
  -e TESTING_REQUIRED=true \
  vibug-viberator
```

### Example 2: JavaScript/React Bug Fix

```bash
docker run --rm --env-file .env \
  -e MODE=cli \
  -e REPO_URL=https://github.com/example/react-app.git \
  -e LANGUAGE=javascript \
  -e BUG_DESCRIPTION="React component not rendering" \
  -e BUG_SEVERITY=medium \
  vibug-viberator
```

### Example 3: Using API

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "bugReport": {
      "id": "react-rendering-001",
      "title": "Component not rendering",
      "description": "UserProfile component returns blank",
      "stepsToReproduce": "1. Navigate to /profile 2. Component is empty",
      "expectedBehavior": "Should show user information",
      "actualBehavior": "Blank page displayed",
      "severity": "medium",
      "language": "javascript",
      "framework": "react"
    },
    "projectSettings": {
      "repoUrl": "https://github.com/example/react-app.git",
      "branch": "main",
      "testingRequired": true
    }
  }'
```

## Architecture

### Components

1. **ConfigManager**: Handles environment variables and AWS SSM configuration
2. **AgentOrchestrator**: Selects and executes appropriate AI agents
3. **BaseAgent**: Abstract base class for all AI agent implementations
4. **Individual Agents**: Specific implementations for each AI service
5. **VibugViberator**: Main application class with HTTP API and CLI modes

### Execution Flow

1. **Configuration Loading**: Load from environment and AWS SSM
2. **Agent Selection**: Analyze bug report and select best agent
3. **Context Preparation**: Prepare execution environment and prompts
4. **Repository Cloning**: Clone target repository to isolated workspace
5. **Agent Execution**: Run selected AI agent CLI with prepared context
6. **Result Processing**: Parse results, detect changed files, run tests
7. **Cleanup**: Clean up workspace and return results

## Security

- Runs as non-root user in container
- API keys are never logged
- Working directories are isolated and cleaned up
- Resource limits prevent excessive usage
- Input validation on all API endpoints

## Monitoring and Logging

The system provides comprehensive logging:

- **Structured JSON logs** for production
- **Request/response tracking** for API calls  
- **Agent execution metrics** (time, cost, success rate)
- **Resource usage monitoring** (memory, CPU, disk)
- **Error tracking** with stack traces

## Troubleshooting

### Common Issues

1. **"No suitable agents available"**
   - Ensure at least one agent has a valid API key
   - Check agent capabilities match the project language

2. **"Configuration validation failed"**
   - Verify all required environment variables are set
   - Check AWS SSM connectivity if using parameter store

3. **"Agent execution timeout"**
   - Increase DEFAULT_TIMEOUT for complex repositories
   - Check repository accessibility and size

4. **"Git clone failed"**
   - Verify repository URL and branch exist
   - Check network connectivity and permissions

### Debug Mode

Enable debug logging:
```bash
docker run --env-file .env -e LOG_LEVEL=debug vibug-viberator
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: Report bugs and feature requests
- Documentation: See `docs/` directory for detailed guides
- Examples: Check `examples/` directory for more usage scenarios