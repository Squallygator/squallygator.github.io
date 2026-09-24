# Protéger un fichier (CV) derrière Cloudflare Turnstile + Worker

Sur un site statique (GitHub Pages), un captcha côté navigateur ne protège rien : l'URL du fichier reste publique.
Ici, le fichier est stocké **hors du dépôt** (Cloudflare Workers KV) et un Worker ne le renvoie qu'après validation **côté serveur** d'un jeton Turnstile.

```
Page GitHub Pages → widget Turnstile → clic sur le bouton
  → POST { token } au Worker
  → Worker vérifie le jeton (siteverify, clé secrète) + le hostname
  → OK : renvoie le fichier depuis KV / KO : 403
```

Coût : gratuit (compte Cloudflare sans carte bancaire, 100 000 lectures KV/jour, URL en `*.workers.dev`, pas de domaine requis).

## Valeurs à adapter à chaque réutilisation
| Élément | Exemple ici |
|---|---|
| Origine du site (`ALLOWED_ORIGIN`) | `https://squallygator.github.io` |
| Nom du Worker (`name`) | `cv-gate` |
| Binding KV | `CV` |
| Clé KV du fichier | `cv` |
| Nom de téléchargement | `CV.pdf` (dans `src/index.js` et `index.html`) |
| Content-Type | `application/pdf` (à changer pour un autre type de fichier) |

Pour un **autre fichier** dans le même dépôt : ajouter une autre clé KV (ex. `dossier`) et transmettre un paramètre (`{ token, file: "dossier" }`) que le Worker utilise dans `env.CV.get(...)`, avec une liste blanche de clés autorisées.

## 1. Compte Cloudflare
1. https://dash.cloudflare.com/sign-up, email + mot de passe, confirmer le lien reçu par mail.
2. Ne pas ajouter de site/domaine, rester sur le tableau de bord.

## 2. Widget Turnstile
1. Menu de gauche → **Turnstile** (ou recherche) → **Add widget**.
2. Widget name : libre ; **Hostname** : le domaine du site (`squallygator.github.io`) ; Mode : *Managed*.
3. Récupérer :
   - **Site Key** (publique) → dans le site (ici `_config.yml`, clé `turnstile_sitekey`) ;
   - **Secret Key** (privée) → uniquement dans Cloudflare via `wrangler secret put` (jamais commitée).

## 3. Outil Wrangler
```bash
npm install -g wrangler
wrangler login
```
`wrangler login` ouvre le navigateur, cliquer sur **Allow**. Node.js requis.

## 4. Worker : code et configuration
Fichiers de ce dossier :
- `wrangler.toml` : nom, `ALLOWED_ORIGIN`, binding KV (l'`id` vient de l'étape suivante).
- `src/index.js` : le Worker. Il
  - répond au préflight CORS et n'accepte que `POST` depuis `ALLOWED_ORIGIN` ;
  - envoie le jeton à `https://challenges.cloudflare.com/turnstile/v0/siteverify` avec `TURNSTILE_SECRET` ;
  - vérifie `success` **et** que `hostname` correspond à l'origine autorisée ;
  - renvoie le fichier lu dans KV (`Content-Disposition: attachment`, `Cache-Control: no-store`).

## 5. Stockage KV, envoi du fichier, déploiement
Depuis ce dossier (`worker/`) :

```bash
# 1. Créer le namespace, copier l'id affiché dans wrangler.toml (refuser l'ajout auto de config)
wrangler kv namespace create CV

# 2. Envoyer le fichier (--remote OBLIGATOIRE, sinon il va dans un KV local de dev)
wrangler kv key put cv --path ../chemin/vers/fichier.pdf --binding CV --remote

# 3. Déployer, noter l'URL affichée (https://<nom>.<sous-domaine>.workers.dev)
wrangler deploy

# 4. Enregistrer la clé secrète Turnstile (coller la Secret Key à l'invite)
wrangler secret put TURNSTILE_SECRET
```
Mettre l'URL du Worker dans le site (ici `_config.yml`, clé `cv_worker_url`).

Pour **remplacer le fichier** plus tard : refaire uniquement l'étape 2. Pour modifier le code : `wrangler deploy`.

## 6. Côté page (index.html)
- Charger le script : `https://challenges.cloudflare.com/turnstile/v0/api.js`.
- `<div class="cf-turnstile" data-sitekey="…" data-callback="onCaptcha" data-appearance="interaction-only">` : le widget reste invisible sauf si un défi est nécessaire.
- Bouton désactivé tant que `onCaptcha(token)` n'a pas été appelé.
- Au clic : `fetch(cv_worker_url, { method: 'POST', body: JSON.stringify({ token }) })` → `blob()` → lien `<a download>` cliqué par script.
- **Un jeton est à usage unique** : après chaque tentative, `token = null` puis `turnstile.reset()`.

## 7. Tests
1. Depuis un téléphone en 4G (pas en Wi-Fi), ouvrir la page, cliquer : le fichier se télécharge.
2. Appel direct refusé :
   ```bash
   curl -i -X POST https://<url-du-worker>
   ```
   Attendu : `403`.

## 8. Nettoyage du dépôt (à faire APRÈS validation des tests)
Si le fichier a déjà été commité, il reste dans l'historique et téléchargeable.
1. Sauvegarder une copie hors dépôt.
2. Retirer le fichier du dépôt et de tout l'historique : soit `git filter-repo --invert-paths --path <fichier>`, soit squasher tout l'historique en un commit (branche orpheline) puis `git push --force`.
3. Ajouter au `.gitignore` : `*.pdf`, `worker/.wrangler/`, `worker/node_modules/`, `.dev.vars`, `.env`.
4. Vérifier que le fichier répond 404 sur le site (attendre la fin du déploiement Pages).
5. Les anciens commits restent accessibles par SHA sur GitHub tant qu'il n'est pas nettoyé côté GitHub : demande de purge via https://support.github.com/contact (« sensitive data removal ») si nécessaire.

## Pièges rencontrés / à retenir
- `.wrangler/` (cache Wrangler) contient l'email du compte Cloudflare : ne jamais le commiter.
- Jekyll copie tous les dossiers non exclus dans le site : garder `worker` dans `exclude` de `_config.yml`.
- Si la protection de branche interdit les push forcés (`gh api …/branches/master/protection`), la retirer avant une réécriture d'historique.
- Turnstile arrête les robots, pas un humain qui reçoit le fichier puis le transmet. Une règle de rate limiting Cloudflare peut compléter si besoin.
- Le contrôle `Origin` du Worker est falsifiable hors navigateur : la vraie barrière est Turnstile + la vérification du `hostname`.
- Les valeurs publiques (site key, id KV, URL du Worker) ne sont pas des secrets. La Secret Key Turnstile, elle, l'est.

## Réglages GitHub gratuits appliqués au dépôt
Secret scanning, push protection, Dependabot security updates, alertes de vulnérabilités, protection de `master` (pas de force push ni suppression) :
```bash
R=repos/<user>/<repo>
gh api -X PATCH $R -F 'security_and_analysis[secret_scanning][status]=enabled' -F 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
gh api -X PUT $R/vulnerability-alerts
gh api -X PUT $R/automated-security-fixes
gh api -X PUT $R/branches/master/protection --input - <<'EOF'
{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
EOF
```
