# AI Personal Workbench

A local-first personal workbench for schedules, tasks, parallel project tracking,
and lightweight review.

The app is intended to run in Docker so Node dependencies, framework caches, and
runtime state stay out of the host project directory. The default Compose setup
builds an image from the repository source and runs the built app without
mounting the project folder into the container.

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

The default Docker flow does not bind-mount the repository into the container.
The image is built from scratch using `package-lock.json`, runs `npm ci` inside
the image build, then runs the compiled app from the final image.

`.dockerignore` excludes host-only directories such as `node_modules`, `dist`,
`.vinext`, and `.wrangler`, so they cannot accidentally leak into the image.

## Useful Files

- `app/page.tsx`: the interactive workbench UI and local state logic
- `app/globals.css`: product styling
- `Dockerfile`: container image definition
- `docker-compose.yml`: local Docker runtime
- `.dockerignore`: keeps host dependencies and build output out of the image
