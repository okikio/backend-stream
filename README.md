# BackendV2
follow me on [GitHub](https://github.com/FifthWit)

BackendV2 is a from scratch rewrite of movie-web's backend using [Nitro](https://nitro.build), and [Drizzle ORM](https://orm.drizzle.team). 

## Deployment
There are multiple supported ways to deploy BackendV2 based on your needs:
### NixPacks
1. Install NixPacks with
```sh
# Mac
brew install nixpacks
# POSIX (mac, linux)
curl -sSL https://nixpacks.com/install.sh | bash
# Windows
irm https://nixpacks.com/install.ps1 | iex
```
2. Build the backend
```sh
nixpacks build ./path/to/app --name my-app # my-app will be the container name aswell
```
3. Run the container
```sh
docker run my-app
```
> [!TIP]
If you use a tool like Dokploy or Coolify, NixPacks support is out of the box
### Railpack
Railpack is the successor to NixPacks, to run the backend via Railpack:

1. Install [Railpack](https://railpack.com/installation)

2. Run BuildKit and set BuildKit host
```sh
docker run --rm --privileged -d --name buildkit moby/buildki

export BUILDKIT_HOST='docker-container://buildkit'
```

3. Build Backend
```sh
cd ./path/to/backend
railpack build .
```

4. Run Backend container
```sh
# Run manually
docker run -it backend
# Run in the background
docker run -d -it backend
```

5. Verify it's running
```sh
docker ps
# You should see backend, and buildkit running
```

### Manually
1. Git clone the environment
```sh
git clone https://github.com/p-stream/backend.git
cd backend
```
2. Build the backend
```sh
npm install && npm run build
```
3. Run the backend
```sh
node .output/server/index.mjs
```

## Setup your environment variables:
To run the backend you need environment variables setup
1. Create .env file
```sh
cp .env.example .env
```

2. Fill in the values in the .env file

> [!NOTE]
> for postgres you may want to use a service like [Neon](https://neon.tech) or host your own with docker, to do that just look it up

## Releasing a new version

The release pipeline is fully automated via GitHub Actions. To publish a new container image and GitHub Release:

1. **Trigger the Bump Version workflow** from the Actions tab:
   - Go to **Actions → Bump Version → Run workflow**
   - Choose the bump type: `patch`, `minor`, or `major`
   - Click **Run workflow**

   This commits the updated `package.json` and `package-lock.json` to `master`, then explicitly dispatches the **Build and Deploy** workflow.

2. **What happens automatically after the version bump:**
   - The backend is built and the `.output` directory is uploaded as a GitHub Actions artifact named `backend`
   - A GitHub Release is created at the new tag (e.g. `v2.2.0`) with auto-generated release notes, which includes a packaged backend asset (`movie-web.backend.zip`)
   - A multi-arch OCI/Docker image (`linux/amd64` + `linux/arm64`) is built with SLSA provenance and SBOM attestations and pushed to GHCR:
     - `ghcr.io/<owner>/<repo>:<version>` (e.g. `ghcr.io/okikio/backend-stream:2.2.0`)
     - `ghcr.io/<owner>/<repo>:latest`
     - `ghcr.io/<owner>/<repo>:sha-<short-sha>`

> [!NOTE]
> Pushing to `master` without bumping the version is safe — the release job detects whether the current version tag already has a GitHub Release and skips creation if it does, so the Docker image is always refreshed while duplicate GitHub Releases are never created.

### CI/CD action versions

| Action | Version |
|--------|---------|
| `actions/checkout` | v6 |
| `actions/setup-node` | v6 |
| `actions/upload-artifact` | v7 |
| `actions/download-artifact` | v8 |
| `docker/setup-qemu-action` | v4 |
| `docker/setup-buildx-action` | v4 |
| `docker/login-action` | v4 |
| `docker/metadata-action` | v6 |
| `docker/build-push-action` | v7 |



## Contributing
We love contributors, it helps the community so much, if you are interested in contributing here are some steps:

1. Clone the repo
```sh
git clone https://github.com/p-stream/backend.git
cd backend
```

2. Install Deps/Run the backend
```sh
npm install && npm run dev
```

3. Set your Environment variables: check above as there is a guide for it!

4. Make your changes! Go crazy, so long as you think it is helpful we'd love to see a Pull Request, have fun, this project is FOSS and done in my our maintainers free time, no pressure, just enjoy yourself

### Philosophy/Habits for devs
Here is a general rule of thumb for what your changes and developments should look like if you plan on getting it merged to the main branch:

- Use Prettier & ESLint: We aren't going to be crazy if it's not well formatted but by using the extensions it keeps our code consistent, which makes it a lot easier for maintainers to help merge your code
- Keep it minimal, things like Email are out of the question, we want to keep it small, if you think that it's **really** needed, make an issue on our GitHub to express your interest in it, and a maintainer will confirm or deny whether we would merge it
- Understand our tech stack, this is a generic piece of advice but if you haven't use NitroJS for example, read their docs and make sure you're familiar with the framework, it makes your code quality much better, and makes reviewing much easier

Star this repo and please follow me on [GitHub](https://github.com/FifthWit)!