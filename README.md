# squallygator.github.io

Carte de visite personnelle (Jekyll + GitHub Pages). Déploiement automatique via `.github/workflows/jekyll-gh-pages.yml` à chaque push sur `master`.

Le QR code (`assets/qr.svg`) pointe vers https://squallygator.github.io/. Pour le régénérer : `pip install segno` puis `segno "https://squallygator.github.io/" -o assets/qr.svg --scale=10`.

## Aperçu local (sans installer Ruby/Jekyll)
```bash
docker compose up
```
Puis http://localhost:4000 (rechargement automatique). Le premier lancement installe les gems (quelques minutes, mises en cache dans un volume). Le téléchargement du CV ne fonctionne pas en local : le Worker n'accepte que l'origine du site publié et le widget Turnstile est lié au hostname `squallygator.github.io`.
