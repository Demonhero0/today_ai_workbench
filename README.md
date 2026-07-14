# AI Personal Workbench

A local-first personal workbench for tasks and parallel project tracking.

The app is intended to run in Docker. The image provides the Node runtime and
the built AI workbench app. Personal workbench data is not baked into the image:
Compose mounts an external data directory at `/data`.

## Prerequisites

- Docker Desktop or another Docker runtime with Compose support

## Run

```bash
npm run docker:up
```

Open:

```text
http://localhost:3000
```

## LLM

The chat and AI suggestions use OpenAI through environment variables. Create a
local `.env` file next to `docker-compose.yml` or export these variables before
starting Docker:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

The API key is read by the container at runtime. It is not written into
`workbench.json`.

Stop the app:

```bash
npm run docker:down
```

## Verify

Build the Docker image:

```bash
npm run docker:build
```

Run the build and rendered HTML test inside Docker:

```bash
npm run docker:test
```

## Host Cleanliness

The default Docker flow does not bind-mount the repository source into the
running container. The image is built from scratch using `package-lock.json`,
runs `npm ci` inside the image build, then runs the compiled app from the final
image.

`.dockerignore` excludes host-only directories such as `node_modules`, `dist`,
`.vinext`, and `.wrangler`, so they cannot accidentally leak into the image.

## Personal Data

Compose mounts this host directory into the container:

```text
../ai-workbench-data -> /data
```

The app reads and writes:

```text
/data/workbench.json
```

That means the app image and your personal data are separate. You can rebuild or
replace the AI workbench image without baking your private task/project data
into the image.

## Useful Files

- `app/page.tsx`: the interactive workbench UI and local state logic
- `app/globals.css`: product styling
- `Dockerfile`: container image definition
- `docker-compose.yml`: local Docker runtime
- `.dockerignore`: keeps host dependencies and build output out of the image
