# Règles d'ingestion

Le flux open data (`donnees.roulez-eco.fr`) est **hostile par nature** : il change de format
sans prévenir, tombe, grossit, ou sert une archive corrompue. L'ingestion doit être le
composant le plus défensif du dépôt.

1. **Le flux ne fait jamais tomber l'API.** Toute défaillance (réseau, ZIP, XML, base) est
   attrapée, loggée, et enregistrée dans `ingestion_runs` avec `status = 'failed'`. Les
   dernières données valides restent servies.
2. **Tout téléchargement est borné** : `INGEST_MAX_ARCHIVE_BYTES` plafonne la taille avant
   décompression (défense contre le zip-bomb), et un délai d'expiration est imposé.
3. **Le parsing est tolérant** : un `<pdv>` malformé est ignoré et compté, il n'interrompt
   pas le lot. Un champ de prix non numérique n'entre jamais en base.
4. **L'écriture est idempotente** : rejouer le même flux ne crée pas de doublon
   (`fuel_price_history` dédupliqué sur `(station_id, fuel, observed_at)`).
5. **Les coordonnées sont validées** (`lat ∈ [-90, 90]`, `lon ∈ [-180, 180]`) avant insertion ;
   une station hors bornes est rejetée et loggée.
6. **La péremption est explicite** : un prix non mis à jour depuis `PRICE_STALE_AFTER_DAYS`
   passe `is_stale = true` ; une rupture passe `is_rupture = true`. Les deux sont exclus de
   la recherche par défaut.
