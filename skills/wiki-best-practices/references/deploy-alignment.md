# Deploy alignment checklist

When auditing deploy-related CI or Pages setup for a custom wiki:

- `-c` points at the correct `wiki.yaml`
- `wiki build --site-base-url` matches the GitHub Pages path (`/wiki`, `/my-wiki`, or `''` for root site)
- `upload-pages-artifact` `path` is the directory tree that contains the built `index.html`
- GitHub repository settings: **Pages → Build and deployment → GitHub Actions**

Typical pipeline order: `check --strict` → `build --output-dir _site` → upload artifact → `deploy-pages`.

Local preview: `wiki -c path/to/wiki.yaml serve` (default `http://127.0.0.1:8080/wiki/` when `site.base_url` is `/wiki`).
