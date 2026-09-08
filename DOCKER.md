# Running Rawaan in Docker

Apply the entire `supabase/schema.sql` in the Supabase SQL Editor and configure `.env.local` using `.env.example`. Clerk sign-in is required for the workspace; the landing page and `/how-to-use` guide are public. Records use Supabase only.

## Docker Compose

```sh
docker compose --env-file .env.local up --build
```

Open [localhost:3000](http://localhost:3000) and sign in. The command's `--env-file` supplies the publishable key for Compose build interpolation; the service's `env_file` supplies server credentials at runtime. Rebuild if the Clerk publishable key changes. Use live Clerk keys and configure the deployment domain for production.

## Standard Docker

Supply the public publishable key as a build argument; keep secrets out of build arguments and images:

```sh
docker build --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_public_key -t rawaan .
docker run -p 3000:3000 --env-file .env.local rawaan
```

## Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public Clerk key compiled into browser assets |
| `CLERK_SECRET_KEY` | Server session/user verification |
| `SUPABASE_URL` | Database project URL; legacy `NEXT_PUBLIC_SUPABASE_URL` is supported |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only elevated database credential |
| `SUPABASE_SECRET_KEY` | Newer alternative; takes precedence when configured |
| `GROQ_API_KEY` | Transcription, note drafting, translation and Assistant replies |
| `LLM_MODEL` | Completion model override |
| `TAVILY_API_KEY` | Optional web search |

Compose mounts no clinical-data volume. Secrets, legacy backups and tutorial production tooling are excluded from the image build context. The unprivileged runner serves the compiled standalone application and public tutorial media. `/api/health` is a liveness check, not proof that cloud services are configured.

## First session and optional training data

Use **Learn Rawaan** or the public guide to record, assign, review and explicitly approve a note. New accounts start empty. The application never inserts fixtures. For a dedicated testing account, first sign in to register its Clerk owner, then run opt-in seed commands with `--owner=<registered Clerk ID>` as documented in [Supabase setup](docs/SUPABASE-STORAGE.md).

See [Clerk configuration](docs/CLERK-AUTH.md), [Assistant behavior](docs/RAWAAN-AI.md) and [verification commands](README.md#verify-changes). A successful application build does not prove Docker, hosted authentication or database access works in a particular deployment.
