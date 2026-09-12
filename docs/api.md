# JobTracker CR — API Documentation

Base URL: `https://career-ops.villalobossebas.me`

---

## GET /api/jobs/daily

Obtener ofertas del día desde Firestore.

### Parámetros (query string)

| Param   | Tipo   | Default | Descripción |
|---------|--------|---------|-------------|
| `date`  | string | hoy     | Fecha `YYYY-MM-DD` |
| `limit` | number | 50      | Máximo 200 |
| `offset`| number | 0       | Offset para paginación |
| `viewed`| string | null    | `true`, `false`, o vacío (todas) |
| `source`| string | null    | Filtro por provider: `greenhouse`, `workday`, `lever`, etc. |

### Ejemplo

```bash
curl "https://career-ops.villalobossebas.me/api/jobs/daily?date=2026-09-12&limit=50&offset=0&viewed=false"
```

### Response

```json
{
  "ok": true,
  "date": "2026-09-12",
  "total": 3641,
  "offset": 0,
  "limit": 50,
  "hasMore": true,
  "jobs": [
    {
      "id": "2026-09-12-abc123def",
      "company": "Amazon",
      "title": "Software Developer",
      "url": "https://www.amazon.jobs/en/positions/...",
      "location": "San José, Costa Rica",
      "description": "Job description text...",
      "source": "workday",
      "date": "2026-09-12",
      "viewed": false,
      "scrapedAt": "2026-09-12T08:32:56.326Z"
    }
  ]
}
```

### Paginación

```bash
# Página 1
curl "https://career-ops.villalobossebas.me/api/jobs/daily?limit=50&offset=0&viewed=false"

# Página 2
curl "https://career-ops.villalobossebas.me/api/jobs/daily?limit=50&offset=50&viewed=false"

# Página 3
curl "https://career-ops.villalobossebas.me/api/jobs/daily?limit=50&offset=100&viewed=false"
```

Cuando `hasMore` es `false`, no hay más páginas.

---

## POST /api/jobs/viewed

Marcar ofertas como vistas o no vistas.

### Headers

| Header | Requerido | Descripción |
|--------|-----------|-------------|
| `Content-Type` | Sí | `application/json` |
| `x-viewed-secret` | Sí | Secreto de autenticación |

### Body

```json
{
  "ids": ["2026-09-12-abc123", "2026-09-12-def456"],
  "viewed": true
}
```

| Campo    | Tipo    | Requerido | Descripción |
|----------|---------|-----------|-------------|
| `ids`    | array   | Sí        | Array de IDs de jobs (max 500) |
| `viewed` | boolean | No        | `true` = marcado como visto, `false` = no visto. Default: `true` |

### Ejemplo

```bash
curl -X POST https://career-ops.villalobossebas.me/api/jobs/viewed \
  -H "Content-Type: application/json" \
  -H "x-viewed-secret: Villaley2145" \
  -d '{"ids":["2026-09-12-abc123","2026-09-12-def456"],"viewed":true}'
```

### Response

```json
{
  "ok": true,
  "updated": 2,
  "viewed": true
}
```

### Errores

| Status | Causa |
|--------|-------|
| 401 | Secret incorrecto o no proporcionado |
| 400 | Body inválido o `ids` vacío |
| 500 | Error de Firestore |

---

## Uso con agente local

```bash
# Obtener ofertas no vistas (primera página)
curl -s "https://career-ops.villalobossebas.me/api/jobs/daily?viewed=false&limit=50" | jq '.jobs[] | "\(.company) - \(.title) [\(.location)]"'

# Marcar un job como visto
curl -X POST https://career-ops.villalobossebas.me/api/jobs/viewed \
  -H "Content-Type: application/json" \
  -H "x-viewed-secret: Villaley2145" \
  -d '{"ids":["2026-09-12-abc123"],"viewed":true}'

# Marcar todos los de una página como vistos
IDS=$(curl -s "https://career-ops.villalobossebas.me/api/jobs/daily?viewed=false&limit=50" | jq -r '.jobs[].id')
curl -X POST https://career-ops.villalobossebas.me/api/jobs/viewed \
  -H "Content-Type: application/json" \
  -H "x-viewed-secret: Villaley2145" \
  -d "{\"ids\":$(echo $IDS | jq -c '.'),\"viewed\":true}"
```

---

## Providers disponibles

Los jobs vienen de 200+ bolsas de empleo. Los providers comunes:

- `workday` — Workday ATS
- `greenhouse` — Greenhouse ATS
- `lever` — Lever ATS
- `smartrecruiters` — SmartRecruiters
- `bamboohr` — BambooHR
- `oraclecloud` — Oracle Cloud ATS
- `icims` — iCIMS
- `ashby` — Ashby
- `jobvite` — Jobvite
- `amazon` — Amazon Jobs
- `jibeapply` — Jibe (Taleo)
- `recruitee` — Recruitee
- `workable` — Workable

---

## Notas

- El scraping corre cada 20 minutos vía GitHub Actions
- Solo se guardan ofertas de **LATAM + Costa Rica**
- Los IDs tienen el formato `{fecha}-{hash}` (ej: `2026-09-12-amazonsoftwaredev`)
- La descripción se trunca a 2000 caracteres
- El campo `viewed` se usa para filtrar ofertas ya revisadas
